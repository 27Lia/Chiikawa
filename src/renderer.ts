(function (): void {
  'use strict';

  const CHARACTER_CONFIGS: CharacterConfig[] = [
    { id: 'chiikawa', image: 'assets/characters/치이카와.png', perchXRatio: 0.15, size: 140, reactionType: 'slip' },
    { id: 'hachiware', image: 'assets/characters/하치와레.png', perchXRatio: 0.38, size: 140, reactionType: 'spin' },
    { id: 'usagi', image: 'assets/characters/우사기.png', perchXRatio: 0.62, size: 140, reactionType: 'jump' },
    { id: 'momonga', image: 'assets/characters/모몽가.png', perchXRatio: 0.85, size: 120, reactionType: 'glide' },
  ];

  const SPAWN_Y = 6;
  const AREA_SIDE_MARGIN = 30;
  const MAX_DT = 0.033;
  const CLICK_MAX_DURATION = 250;
  const CLICK_MAX_DISTANCE = 6;

  const IDLE_SWAY_AMPLITUDE = 0.09;
  const IDLE_SWAY_SPEED_MIN = 1.0;
  const IDLE_SWAY_SPEED_MAX = 1.8;

  const IDLE_DURATION_MIN = 1800;
  const IDLE_DURATION_MAX = 4500;
  const WALK_SPEED_MIN = 20;
  const WALK_SPEED_MAX = 45;
  const WALK_TARGET_PADDING = 40;

  const SLIP_FALL_DURATION = 0.18;
  const SLIP_CLIMB_DURATION = 0.5;
  const SLIP_DROP_RATIO = 0.55;

  const JUMP_UP_DURATION = 0.18;
  const JUMP_DOWN_DURATION = 0.22;
  const JUMP_HEIGHT_RATIO = 0.4;

  const SPIN_DURATION = 0.45;

  const GLIDE_DURATION = 0.9;
  const GLIDE_DISTANCE = 140;
  const GLIDE_RISE_RATIO = 0.25;

  const DEFAULT_SETTINGS: AppSettings = {
    dragEnabled: true,
    reactionsEnabled: true,
    autoWalkEnabled: true,
    pinMode: 'desktop',
    characters: { chiikawa: true, hachiware: true, usagi: true, momonga: true },
  };

  interface Pet {
    config: CharacterConfig;
    image: HTMLImageElement;
    imageLoaded: boolean;
    x: number;
    y: number;
    facing: 1 | -1;
    walking: boolean;
    dragging: boolean;
    dragOffsetX: number;
    dragOffsetY: number;
    idleUntil: number;
    targetX: number;
    walkSpeed: number;
    swayPhase: number;
    swaySpeed: number;
    swayAngle: number;
    reactionActive: boolean;
    reactionPhase: 1 | 2;
    reactionT: number;
    dropOffset: number;
    spinAngle: number;
    glideStartX: number;
    glideDir: 1 | -1;
    glideDistance: number;
    pointerDownTime: number;
    pointerDownX: number;
    pointerDownY: number;
    pointerMoved: boolean;
  }

  const canvasElCheck = document.getElementById('pet-canvas');
  if (!(canvasElCheck instanceof HTMLCanvasElement)) {
    throw new Error('canvas not found');
  }
  const canvasEl: HTMLCanvasElement = canvasElCheck;
  const contextCheck = canvasEl.getContext('2d');
  if (!contextCheck) {
    throw new Error('2d context not available');
  }
  const context: CanvasRenderingContext2D = contextCheck;

  let pets: Pet[] = [];
  let windowWidth = window.innerWidth;
  let windowHeight = window.innerHeight;
  let mouseEventsIgnored = true;
  let lastFrameTime = 0;
  let activeDragPet: Pet | null = null;
  let settings: AppSettings = DEFAULT_SETTINGS;
  const startTime = performance.now();

  function randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  function easeInQuad(t: number): number {
    return t * t;
  }

  function easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function setIgnoreMouseEvents(ignore: boolean): void {
    if (mouseEventsIgnored === ignore) {
      return;
    }
    mouseEventsIgnored = ignore;
    window.petAPI.setIgnoreMouseEvents(ignore);
  }

  function areaBoundsX(size: number): { min: number; max: number } {
    return {
      min: AREA_SIDE_MARGIN + size / 2,
      max: windowWidth - AREA_SIDE_MARGIN - size / 2,
    };
  }

  function clampToWindow(pet: Pet): void {
    const { min, max } = areaBoundsX(pet.config.size);
    pet.x = clamp(pet.x, min, max);
    pet.targetX = clamp(pet.targetX, min, max);
    pet.y = clamp(pet.y, 0, windowHeight - pet.config.size);
  }

  function pickNewTarget(pet: Pet): void {
    const { min, max } = areaBoundsX(pet.config.size);
    pet.targetX = clamp(randomRange(min + WALK_TARGET_PADDING, max - WALK_TARGET_PADDING), min, max);
    pet.walkSpeed = randomRange(WALK_SPEED_MIN, WALK_SPEED_MAX);
  }

  function goIdle(pet: Pet, elapsedMs: number): void {
    pet.walking = false;
    pet.idleUntil = elapsedMs + randomRange(IDLE_DURATION_MIN, IDLE_DURATION_MAX);
  }

  function isVisible(pet: Pet): boolean {
    return settings.characters[pet.config.id];
  }

  function createPet(config: CharacterConfig): Pet {
    const img = new Image();
    const pet: Pet = {
      config,
      image: img,
      imageLoaded: false,
      x: windowWidth * config.perchXRatio,
      y: SPAWN_Y,
      facing: 1,
      walking: false,
      dragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      idleUntil: 0,
      targetX: windowWidth * config.perchXRatio,
      walkSpeed: randomRange(WALK_SPEED_MIN, WALK_SPEED_MAX),
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: randomRange(IDLE_SWAY_SPEED_MIN, IDLE_SWAY_SPEED_MAX),
      swayAngle: 0,
      reactionActive: false,
      reactionPhase: 1,
      reactionT: 0,
      dropOffset: 0,
      spinAngle: 0,
      glideStartX: 0,
      glideDir: 1,
      glideDistance: 0,
      pointerDownTime: 0,
      pointerDownX: 0,
      pointerDownY: 0,
      pointerMoved: false,
    };
    img.onload = (): void => {
      pet.imageLoaded = true;
    };
    img.onerror = (): void => {
      pet.imageLoaded = false;
    };
    img.src = config.image;
    goIdle(pet, performance.now() - startTime);
    return pet;
  }

  function layoutPets(): void {
    for (const pet of pets) {
      clampToWindow(pet);
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

  function hitTest(pet: Pet, x: number, y: number): boolean {
    if (!isVisible(pet)) {
      return false;
    }
    const half = pet.config.size / 2;
    const centerX = pet.x;
    const centerY = pet.y + pet.dropOffset + half;
    const dx = x - centerX;
    const dy = y - centerY;
    return Math.sqrt(dx * dx + dy * dy) <= half;
  }

  function findPetAt(x: number, y: number): Pet | null {
    for (let i = pets.length - 1; i >= 0; i--) {
      if (hitTest(pets[i], x, y)) {
        return pets[i];
      }
    }
    return null;
  }

  function onPointerMove(ev: MouseEvent): void {
    if (activeDragPet) {
      const pet = activeDragPet;
      const newX = ev.clientX - pet.dragOffsetX;
      const newY = ev.clientY - pet.dragOffsetY;
      const { min, max } = areaBoundsX(pet.config.size);
      pet.x = clamp(newX, min, max);
      pet.y = clamp(newY, 0, windowHeight - pet.config.size);

      const moveDx = ev.clientX - pet.pointerDownX;
      const moveDy = ev.clientY - pet.pointerDownY;
      if (Math.sqrt(moveDx * moveDx + moveDy * moveDy) > CLICK_MAX_DISTANCE) {
        pet.pointerMoved = true;
      }
      return;
    }

    const hovered = findPetAt(ev.clientX, ev.clientY) !== null;
    setIgnoreMouseEvents(!hovered);
  }

  function onPointerDown(ev: MouseEvent): void {
    const pet = findPetAt(ev.clientX, ev.clientY);
    if (!pet) {
      return;
    }
    pet.pointerDownTime = performance.now();
    pet.pointerDownX = ev.clientX;
    pet.pointerDownY = ev.clientY;
    pet.pointerMoved = false;

    if (settings.dragEnabled) {
      pet.dragging = true;
      pet.dragOffsetX = ev.clientX - pet.x;
      pet.dragOffsetY = ev.clientY - pet.y;
      activeDragPet = pet;
    }
  }

  function triggerReaction(pet: Pet): void {
    pet.reactionActive = true;
    pet.reactionPhase = 1;
    pet.reactionT = 0;

    if (pet.config.reactionType === 'glide') {
      const { min, max } = areaBoundsX(pet.config.size);
      const roomRight = max - pet.x;
      const roomLeft = pet.x - min;
      pet.glideDir = roomRight >= roomLeft ? 1 : -1;
      pet.glideDistance = Math.min(GLIDE_DISTANCE, Math.max(roomRight, roomLeft));
      pet.glideStartX = pet.x;
      pet.facing = pet.glideDir;
    }
  }

  function finishPointer(pet: Pet, ev: MouseEvent): void {
    const moveDx = ev.clientX - pet.pointerDownX;
    const moveDy = ev.clientY - pet.pointerDownY;
    const moved = pet.pointerMoved || Math.sqrt(moveDx * moveDx + moveDy * moveDy) > CLICK_MAX_DISTANCE;
    const duration = performance.now() - pet.pointerDownTime;

    if (!moved && duration <= CLICK_MAX_DURATION && !pet.reactionActive && settings.reactionsEnabled) {
      triggerReaction(pet);
    } else if (moved) {
      goIdle(pet, performance.now() - startTime);
    }
  }

  function onPointerUp(ev: MouseEvent): void {
    if (activeDragPet) {
      const pet = activeDragPet;
      activeDragPet = null;
      pet.dragging = false;
      finishPointer(pet, ev);
      const stillHovered = findPetAt(ev.clientX, ev.clientY) !== null;
      setIgnoreMouseEvents(!stillHovered);
      return;
    }

    const pet = findPetAt(ev.clientX, ev.clientY);
    if (!pet) {
      return;
    }
    finishPointer(pet, ev);
  }

  function stepWalk(pet: Pet, dt: number, elapsedMs: number): void {
    if (!settings.autoWalkEnabled) {
      pet.walking = false;
      pet.swayPhase += dt * pet.swaySpeed;
      pet.swayAngle = Math.sin(pet.swayPhase) * IDLE_SWAY_AMPLITUDE;
      return;
    }

    if (!pet.walking) {
      pet.swayPhase += dt * pet.swaySpeed;
      pet.swayAngle = Math.sin(pet.swayPhase) * IDLE_SWAY_AMPLITUDE;
      if (elapsedMs >= pet.idleUntil) {
        pickNewTarget(pet);
        pet.walking = true;
      }
      return;
    }

    pet.swayAngle = 0;
    const dx = pet.targetX - pet.x;
    if (Math.abs(dx) < 2) {
      goIdle(pet, elapsedMs);
      return;
    }
    pet.facing = dx > 0 ? 1 : -1;
    pet.x += pet.facing * pet.walkSpeed * dt;
  }

  function stepReaction(pet: Pet, dt: number, elapsedMs: number): void {
    pet.dropOffset = 0;
    pet.spinAngle = 0;
    if (!pet.reactionActive) {
      return;
    }
    pet.reactionT += dt;

    if (pet.config.reactionType === 'slip') {
      if (pet.reactionPhase === 1) {
        const t = Math.min(pet.reactionT / SLIP_FALL_DURATION, 1);
        pet.dropOffset = easeOutQuad(t) * pet.config.size * SLIP_DROP_RATIO;
        if (t >= 1) {
          pet.reactionPhase = 2;
          pet.reactionT = 0;
        }
        return;
      }
      const t = Math.min(pet.reactionT / SLIP_CLIMB_DURATION, 1);
      pet.dropOffset = (1 - easeInOutQuad(t)) * pet.config.size * SLIP_DROP_RATIO;
      if (t >= 1) {
        pet.reactionActive = false;
        pet.dropOffset = 0;
        goIdle(pet, elapsedMs);
      }
      return;
    }

    if (pet.config.reactionType === 'jump') {
      if (pet.reactionPhase === 1) {
        const t = Math.min(pet.reactionT / JUMP_UP_DURATION, 1);
        pet.dropOffset = -easeOutQuad(t) * pet.config.size * JUMP_HEIGHT_RATIO;
        if (t >= 1) {
          pet.reactionPhase = 2;
          pet.reactionT = 0;
        }
        return;
      }
      const t = Math.min(pet.reactionT / JUMP_DOWN_DURATION, 1);
      pet.dropOffset = -(1 - easeInQuad(t)) * pet.config.size * JUMP_HEIGHT_RATIO;
      if (t >= 1) {
        pet.reactionActive = false;
        pet.dropOffset = 0;
        goIdle(pet, elapsedMs);
      }
      return;
    }

    if (pet.config.reactionType === 'spin') {
      const t = Math.min(pet.reactionT / SPIN_DURATION, 1);
      pet.spinAngle = easeInOutQuad(t) * Math.PI * 2;
      if (t >= 1) {
        pet.reactionActive = false;
        pet.spinAngle = 0;
        goIdle(pet, elapsedMs);
      }
      return;
    }

    const t = Math.min(pet.reactionT / GLIDE_DURATION, 1);
    pet.x = pet.glideStartX + pet.glideDir * pet.glideDistance * easeInOutQuad(t);
    pet.dropOffset = -Math.sin(t * Math.PI) * pet.config.size * GLIDE_RISE_RATIO;
    if (t >= 1) {
      pet.reactionActive = false;
      pet.dropOffset = 0;
      const { min, max } = areaBoundsX(pet.config.size);
      pet.x = clamp(pet.x, min, max);
      goIdle(pet, elapsedMs);
    }
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
    const size = pet.config.size;
    const angle = pet.reactionActive && pet.config.reactionType === 'spin' ? pet.spinAngle : pet.swayAngle;

    context.save();
    context.translate(pet.x, pet.y + pet.dropOffset);
    context.rotate(angle);
    context.scale(pet.facing, 1);

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
    const elapsedMs = timestamp - startTime;

    context.clearRect(0, 0, windowWidth, windowHeight);

    for (const pet of pets) {
      if (!isVisible(pet)) {
        continue;
      }
      if (pet.dragging) {
        drawPet(pet);
        continue;
      }
      if (!pet.reactionActive) {
        stepWalk(pet, dt, elapsedMs);
      }
      stepReaction(pet, dt, elapsedMs);
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
    window.petAPI.onSettingsChanged((updated) => {
      settings = updated;
    });
    requestAnimationFrame(render);
  }

  init();
})();
