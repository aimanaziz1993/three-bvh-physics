import * as THREE from 'three';

export {};

declare global {
  interface Window {
    camera: THREE.PerspectiveCamera;
  }
}