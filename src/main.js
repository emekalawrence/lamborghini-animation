import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import './style.css'

// ---------- UI & DOM ----------
const $ = (s) => document.querySelector(s)
$('#app').innerHTML = `
  <canvas id="viewport"></canvas>
  <div class="overlay-header">
    <h1 class="overlay-title">Lamborghini Aventador</h1>
    <p class="overlay-subtitle">3D Stunt Loop • Drag to orbit, scroll to zoom</p>
  </div>
  <div class="controls-bar">
    <button id="btn-play" class="btn">⏸ Pause</button>
    <button id="btn-restart" class="btn">↺ Restart</button>
    <button id="btn-speed" class="btn">0.6x</button>
    <div class="divider"></div>
    <button id="btn-follow" class="btn">Follow: Off</button>
    <button id="btn-reset-cam" class="btn">View</button>
    <div class="divider"></div>
    <div class="timeline-wrap">
      <input id="time-scrubber" class="time-scrubber" type="range" min="0" max="100" step="0.1" value="0" />
      <span id="time-label" class="time-label">0.0s / 5.0s</span>
    </div>
  </div>
`

const canvas = $('#viewport'), btnPlay = $('#btn-play'), btnRestart = $('#btn-restart'),
  btnSpeed = $('#btn-speed'), btnFollow = $('#btn-follow'), btnResetCam = $('#btn-reset-cam'),
  scrubber = $('#time-scrubber'), timeLabel = $('#time-label')

// ---------- Renderer & Scene Setup ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0e17)
scene.fog = new THREE.Fog(0x0b0e17, 800, 4200)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture

// Ground Floor & Grid
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(16000, 16000),
  new THREE.MeshStandardMaterial({ color: 0x101422, roughness: 0.85, metalness: 0.2 })
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
const grid = new THREE.GridHelper(16000, 200, 0x24324f, 0x141a2a)
grid.position.y = 0.1
scene.add(floor, grid)

// Lighting
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
keyLight.position.set(400, 750, 450)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
Object.assign(keyLight.shadow.camera, { near: 100, far: 2500, left: -650, right: 650, top: 650, bottom: -650 })
keyLight.shadow.bias = -0.0004

const rimLight = new THREE.DirectionalLight(0x4a88ff, 1.3)
rimLight.position.set(-450, 300, -500)
scene.add(keyLight, new THREE.HemisphereLight(0xdce6ff, 0x141824, 0.9), rimLight)

// Camera & OrbitControls (framed to user's elevated side-profile view)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 10000)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.maxPolarAngle = Math.PI / 2 - 0.02

const defaultCamPos = new THREE.Vector3(850, 420, -120), defaultTarget = new THREE.Vector3(0, 55, -260)
camera.position.copy(defaultCamPos)
controls.target.copy(defaultTarget)

// ---------- Animation State ----------
const carWrapper = new THREE.Group()
scene.add(carWrapper)

let mixer, actions = [], emptyObj, rawClipDuration = 0, currentTime = 0
let isPlaying = true, playbackSpeed = 0.6, isScrubbing = false, followCar = false
const pos0 = new THREE.Vector3(), pos1 = new THREE.Vector3(), carWorldPos = new THREE.Vector3()
const clock = new THREE.Clock(), DURATION = 5.0, speeds = [0.4, 0.6, 0.8, 1.0]

// Load Model & Configure Actions
new GLTFLoader().load(
  `${import.meta.env.BASE_URL}CAR1d.glb`,(gltf) => {
  const model = gltf.scene
  model.traverse(c => { if (c.isMesh) c.castShadow = c.receiveShadow = true })
  carWrapper.add(model)
  emptyObj = model.getObjectByName('Empty') || model

  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
  floor.position.y = box.min.y
  grid.position.y = box.min.y + 0.1

  mixer = new THREE.AnimationMixer(model)
  actions = gltf.animations.map(clip => {
    const act = mixer.clipAction(clip)
    act.play()
    act.paused = true
    return act
  })
  rawClipDuration = Math.max(...gltf.animations.map(c => c.duration))

  // Sample start (t=0) and end (t=rawDuration) car positions
  const sample = (t, v) => {
    actions.forEach(a => a.time = t)
    mixer.update(0)
    model.updateMatrixWorld(true)
    v.copy(emptyObj.position)
  }
  sample(0, pos0)
  sample(rawClipDuration, pos1)

  defaultTarget.set(center.x, center.y + 15, center.z)
  defaultCamPos.set(center.x + 850, center.y + 380, center.z + 140)
  camera.position.copy(defaultCamPos)
  controls.target.copy(defaultTarget)
  controls.minDistance = size.z * 0.3
  controls.maxDistance = size.z * 5.0
  controls.update()
  keyLight.target = model

  setTime(0)
})

// Seamless 5.0s Loop with Gentle Ease-In/Out
function setTime(t) {
  if (!rawClipDuration || !actions.length) return
  currentTime = ((t % DURATION) + DURATION) % DURATION
  const u = 0.5 - 0.5 * Math.cos(Math.PI * (currentTime / DURATION))
  const STUNT = 0.82

  if (u < STUNT) {
    const rawTime = (u / STUNT) * rawClipDuration
    carWrapper.position.set(0, 0, 0)
    carWrapper.rotation.set(0, 0, 0)
    actions.forEach(a => a.time = Math.min(rawTime, a.getClip().duration))
  } else {
    const s = (u - STUNT) / (1.0 - STUNT)
    actions.forEach(a => a.time = a.getClip().duration)
    const curRotY = THREE.MathUtils.lerp(Math.PI, 2 * Math.PI, s)
    const target = new THREE.Vector3(
      Math.sin(Math.PI * s) * 24,
      THREE.MathUtils.lerp(pos1.y, pos0.y, s),
      THREE.MathUtils.lerp(pos1.z, pos0.z, s)
    )
    const offset = pos1.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), curRotY - Math.PI)
    carWrapper.position.copy(target).sub(offset)
    carWrapper.rotation.set(0, curRotY - Math.PI, 0)
  }

  mixer.update(0)
  if (!isScrubbing) scrubber.value = (currentTime / DURATION) * 100
  timeLabel.textContent = `${currentTime.toFixed(1)}s / ${DURATION.toFixed(1)}s`
}

// ---------- Controls & Event Handlers ----------
btnPlay.onclick = () => {
  isPlaying = !isPlaying
  btnPlay.textContent = isPlaying ? '⏸ Pause' : '▶ Play'
  btnPlay.classList.toggle('active', !isPlaying)
}
btnRestart.onclick = () => setTime(0)
btnSpeed.onclick = () => {
  playbackSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length]
  btnSpeed.textContent = `${playbackSpeed.toFixed(1)}x`
}
btnFollow.onclick = () => {
  followCar = !followCar
  btnFollow.textContent = `Follow: ${followCar ? 'On' : 'Off'}`
  btnFollow.classList.toggle('active', followCar)
}
const resetCamera = () => {
  controls.target.copy(defaultTarget)
  camera.position.copy(defaultCamPos)
  controls.update()
}
btnResetCam.onclick = resetCamera

scrubber.oninput = () => { isScrubbing = true; setTime((parseFloat(scrubber.value) / 100) * DURATION) }
scrubber.onchange = () => { isScrubbing = false }

window.onkeydown = (e) => {
  if (e.code === 'Space') { e.preventDefault(); btnPlay.click() }
  else if (e.code === 'KeyR') resetCamera()
}

window.onresize = () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
}

// ---------- Render Loop ----------
function animate() {
  requestAnimationFrame(animate)
  const dt = clock.getDelta()
  if (isPlaying && !isScrubbing && rawClipDuration) setTime(currentTime + dt * playbackSpeed)

  if (followCar && emptyObj) {
    emptyObj.getWorldPosition(carWorldPos)
    controls.target.lerp(new THREE.Vector3(carWorldPos.x, carWorldPos.y + 30, carWorldPos.z), 0.08)
  }
  controls.update()
  renderer.render(scene, camera)
}
animate()
