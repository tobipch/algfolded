<script setup>
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useSettingsStore} from "@/stores/SettingsStore";

// `interactive`: this cube gets played on (the case modal animates algs
// through playAlg) and is draggable, so it needs the 3D engine. Left off, the
// cube is a still picture of the case and renders as a 2D net, which skips
// cubing's 3D chunk entirely — that chunk is the single biggest download in
// the app, and a thumbnail doesn't earn it.
const props = defineProps({
  scramble: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
})
const settings = useSettingsStore()
const containerDiv = ref(null)
let player = null

// Load the twisty engine only when a cube is actually rendered.
let TwistyPlayerClass = null
let createToken = 0

const windowWidth = ref(window.innerWidth || document.documentElement.clientWidth)
const windowHeight = ref(window.innerHeight || document.documentElement.clientHeight)

function updateDimensions() {
  windowWidth.value = window.innerWidth || document.documentElement.clientWidth;
  windowHeight.value = window.innerHeight || document.documentElement.clientHeight
}

const cubePictureSize = computed(() => {
  const breakpoints = [
    { breakpoint: 416, pictureSize: 120 },
    { breakpoint: 576, pictureSize: 120 },
    { breakpoint: 768, pictureSize: 150 },
    { breakpoint: 960, pictureSize: 200 },
  ];

  for (let { breakpoint, pictureSize } of breakpoints) {
    if (windowWidth.value < breakpoint || windowHeight.value < breakpoint) {
      return pictureSize;
    }
  }

  return 250;
})

const createPlayer = async () => {
  const myToken = ++createToken
  if (player) {
    player.remove()
    player = null
  }

  if (!props.scramble || !containerDiv.value) return

  if (!TwistyPlayerClass) {
    TwistyPlayerClass = (await import("cubing/twisty")).TwistyPlayer
  }
  // a newer createPlayer() ran while the engine was loading -> abort this one
  if (myToken !== createToken || !props.scramble || !containerDiv.value) return

  const orient = (settings.store.cubeOrientation || "").trim()
  const alg = orient ? orient + " " + props.scramble : props.scramble

  player = new TwistyPlayerClass({
    puzzle: "3x3x3",
    alg: alg,
    visualization: props.interactive ? "3D" : "2D",
    hintFacelets: "none",
    backView: "none",
    background: "none",
    controlPanel: "none",
    experimentalDragInput: props.interactive ? "auto" : "none",
  })

  player.style.width = `${cubePictureSize.value}px`
  player.style.height = `${cubePictureSize.value}px`
  containerDiv.value.appendChild(player)
}

watch(() => props.scramble, createPlayer)
watch(() => cubePictureSize.value, () => {
  if (player) {
    player.style.width = `${cubePictureSize.value}px`
    player.style.height = `${cubePictureSize.value}px`
  }
})

onMounted(() => {
  window.addEventListener('resize', updateDimensions)
  createPlayer()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateDimensions)
  if (player) {
    player.remove()
    player = null
  }
})

// Animate an algorithm from the pictured state: the current scramble becomes
// the setup, the alg plays on top of it (ending on a solved cube).
const playAlg = (alg) => {
  if (!player || !alg) return
  const orient = (settings.store.cubeOrientation || "").trim()
  const setup = orient ? orient + " " + props.scramble : props.scramble
  player.experimentalSetupAlg = setup
  player.alg = alg
  player.jumpToStart()
  player.play()
}

defineExpose({playAlg})
</script>

<template>
  <div ref="containerDiv"></div>
</template>

<style scoped>
</style>
