(function (): void {
  'use strict';

  const CHARACTER_CONFIGS: CharacterConfig[] = [
    { image: 'assets/characters/character1.png', anchorXRatio: 0.5, ropeLength: 200, size: 160 },
  ];

  const GRAVITY = 20;
  const DAMPING = 0.6;
  const WIND_STRENGTH = 0.6;
  const WIND_FREQ_1 = 0.37;
  const WIND_FREQ_2 = 0.13;
  const MAX_OMEGA = 12;
  const MAX_DT = 0.033;
  const CLICK_MAX_DURATION = 250;
  const CLICK_MAX_DISTANCE = 6;
  const BOUNCE_KICK = 4;

  interface Pet {
    config: CharacterConfig;
    image: HTMLImageElement;
    imageLoaded: boolean;
    anchorX: number;
    anchorY: number;
    theta: number;
    omega: number;
    dragging: boolean;
    lastDragTheta: number;
    lastDragTime: number;
    pointerDownTime: number;
    pointerDownX: number;
    pointerDownY: number;
    pointerMoved: boolean;
    bounceKick: number;
  }

  const canvasEl = document.getElementById('pet-canvas');
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('canvas not found');
  }
  const context = canvasEl.getContext('2d');
  if (!context) {
    throw new Error('2d context not available');
  }

  let pets: Pet[] = [];
  let windowWidth = window.innerWidth;
  let windowHeight = window.innerHeight;
  let mouseEventsIgnored = true;
  let activeDragPet: Pet | null = null;
  let lastFrameTime = 0;
  const startTime = performance.now();

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function setIgnoreMouseEvents(ignore: boolean): void {
    if (mouseEventsIgnored === ignore) {
      return;
    }
    mouseEventsIgnored = ignore;
    window.petAPI.setIgnoreMouseEvents(ignore);
  }

  function createPet(config: CharacterConfig): Pet {
    const img = new Image();
    const pet: Pet = {
      config,
      image: img,
      imageLoaded: false,
      anchorX: 0,
      anchorY: 0,
      theta: 0.15,
      omega: 0,
      dragging: false,
      lastDragTheta: 0,
      lastDragTime: 0,
      pointerDownTime: 0,
      pointerDownX: 0,
      pointerDownY: 0,
      pointerMoved: false,
      bounceKick: 0,
    };
    img.onload = (): void => {
      pet.imageLoaded = true;
    };
    img.onerror = (): void => {
      pet.imageLoaded = false;
    };
    img.src = config.image;
    return pet;
  }

  function layoutPets(): void {
    for (const pet of pets) {
      pet.anchorX = windowWidth * pet.config.anchorXRatio;
      pet.anchorY = 0;
    }
  }

  function resizeCanvas(): void {
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(windowWidth * dpr);
    canvasEl.height = Math.round(windowHeight * dpr);
    canvasEl.style.width = windowWidth + 'px';
    canvasEl.style.height = windowHeight + 'px';
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutPets();
  }

  function bobPosition(pet: Pet): { x: number; y: number } {
    const x = pet.anchorX + pet.config.ropeLength * Math.sin(pet.theta);
    const y = pet.anchorY + pet.config.ropeLength * Math.cos(pet.theta);
    return { x, y };
  }

  function characterCenter(pet: Pet): { x: number; y: number } {
    const bob = bobPosition(pet);
    const half = pet.config.size / 2;
    return {
      x: bob.x + half * Math.sin(pet.theta),
      y: bob.y + half * Math.cos(pet.theta),
    };
  }

  function hitTest(pet: Pet, x: number, y: number): boolean {
    const center = characterCenter(pet);
    const dx = x - center.x;
    const dy = y - center.y;
    return Math.sqrt(dx * dx + dy * dy) <= pet.config.size / 2;
  }

  function findPetAt(x: number, y: number): Pet | null {
    for (let i = pets.length - 1; i >= 0; i--) {
      if (hitTest(pets[i], x, y)) {
        return pets[i];
      }
    }
    return null;
  }

  function normalizeAngleDelta(delta: number): number {
    let result = delta;
    while (result > Math.PI) {
      result -= Math.PI * 2;
    }
    while (result < -Math.PI) {
      result += Math.PI * 2;
    }
    return result;
  }

  function onPointerMove(ev: MouseEvent): void {
    const x = ev.clientX;
    const y = ev.clientY;

    if (activeDragPet && activeDragPet.dragging) {
      const pet = activeDragPet;
      const dx = x - pet.anchorX;
      const dy = y - pet.anchorY;
      const newTheta = Math.atan2(dx, dy);
      const now = performance.now();
      const dt = Math.max((now - pet.lastDragTime) / 1000, 0.001);
      const deltaTheta = normalizeAngleDelta(newTheta - pet.lastDragTheta);

      pet.omega = clamp(deltaTheta / dt, -MAX_OMEGA, MAX_OMEGA);
      pet.theta = newTheta;
      pet.lastDragTheta = newTheta;
      pet.lastDragTime = now;

      const moveDx = x - pet.pointerDownX;
      const moveDy = y - pet.pointerDownY;
      if (Math.sqrt(moveDx * moveDx + moveDy * moveDy) > CLICK_MAX_DISTANCE) {
        pet.pointerMoved = true;
      }
      return;
    }

    const hovered = findPetAt(x, y) !== null;
    setIgnoreMouseEvents(!hovered);
  }

  function onPointerDown(ev: MouseEvent): void {
    const pet = findPetAt(ev.clientX, ev.clientY);
    if (!pet) {
      return;
    }
    pet.dragging = true;
    pet.lastDragTheta = pet.theta;
    pet.lastDragTime = performance.now();
    pet.pointerDownTime = performance.now();
    pet.pointerDownX = ev.clientX;
    pet.pointerDownY = ev.clientY;
    pet.pointerMoved = false;
    activeDragPet = pet;
  }

  function onPointerUp(ev: MouseEvent): void {
    if (!activeDragPet) {
      return;
    }
    const pet = activeDragPet;
    pet.dragging = false;
    activeDragPet = null;

    const duration = performance.now() - pet.pointerDownTime;
    if (!pet.pointerMoved && duration <= CLICK_MAX_DURATION) {
      pet.bounceKick += (Math.random() > 0.5 ? 1 : -1) * BOUNCE_KICK;
    }

    const stillHovered = findPetAt(ev.clientX, ev.clientY) !== null;
    setIgnoreMouseEvents(!stillHovered);
  }

  function step(pet: Pet, dt: number, elapsed: number): void {
    if (pet.dragging) {
      return;
    }

    const wind = WIND_STRENGTH * Math.sin(elapsed * WIND_FREQ_1) * Math.sin(elapsed * WIND_FREQ_2);
    const gravityTorque = -(GRAVITY / pet.config.ropeLength) * Math.sin(pet.theta);
    const dampingTorque = -DAMPING * pet.omega;
    const alpha = gravityTorque + dampingTorque + wind + pet.bounceKick;
    pet.bounceKick = 0;

    pet.omega = clamp(pet.omega + alpha * dt, -MAX_OMEGA, MAX_OMEGA);
    pet.theta += pet.omega * dt;
  }

  function drawPlaceholder(pet: Pet): void {
    const size = pet.config.size;
    context.beginPath();
    context.arc(0, size / 2, size / 2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(200, 200, 200, 0.9)';
    context.fill();
    context.strokeStyle = 'rgba(120, 120, 120, 0.9)';
    context.lineWidth = 2;
    context.stroke();
  }

  function drawPet(pet: Pet): void {
    const bob = bobPosition(pet);

    context.save();
    context.strokeStyle = 'rgba(80, 80, 80, 0.8)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(pet.anchorX, pet.anchorY);
    context.lineTo(bob.x, bob.y);
    context.stroke();
    context.restore();

    const size = pet.config.size;

    context.save();
    context.translate(bob.x, bob.y);
    context.rotate(pet.theta);

    if (pet.imageLoaded) {
      context.drawImage(pet.image, -size / 2, 0, size, size);
    } else {
      drawPlaceholder(pet);
    }

    context.restore();
  }

  function render(timestamp: number): void {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }
    const dt = Math.min((timestamp - lastFrameTime) / 1000, MAX_DT);
    lastFrameTime = timestamp;
    const elapsed = (timestamp - startTime) / 1000;

    for (const pet of pets) {
      step(pet, dt, elapsed);
    }

    context.clearRect(0, 0, windowWidth, windowHeight);
    for (const pet of pets) {
      drawPet(pet);
    }

    requestAnimationFrame(render);
  }

  function init(): void {
    pets = CHARACTER_CONFIGS.map(createPet);
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mouseup', onPointerUp);
    requestAnimationFrame(render);
  }

  init();
})();
