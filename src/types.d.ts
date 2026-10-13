interface CharacterConfig {
  image: string;
  anchorXRatio: number;
  ropeLength: number;
  size: number;
}

interface PetAPI {
  setIgnoreMouseEvents(ignore: boolean): void;
}

interface Window {
  petAPI: PetAPI;
}
