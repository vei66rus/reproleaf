import * as THREE from 'three';
import {fixed,root,ready} from './shared.js';
root.innerHTML='<div class="scene-host" data-host></div><h1 class="scene-label">Resize this synthetic scene</h1>';
document.body.classList.add('scene-page');
const host=root.querySelector('[data-host]');
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power'});
renderer.setPixelRatio(1);renderer.setClearColor('#d7e7dc');host.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,100);
camera.position.z=5;
const geometry=new THREE.BoxGeometry(1.3,1.3,1.3),material=new THREE.MeshNormalMaterial();
const cube=new THREE.Mesh(geometry,material);cube.rotation.set(.35,.6,0);scene.add(cube);
function resize(){const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.render(scene,camera);}
resize();
if(fixed)new ResizeObserver(resize).observe(host);
ready();
