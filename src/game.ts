// =====================================================================
// game.ts — the conductor. It owns the game loop and connects the
// simulation (sim/), the 3D world (world/, render/) and the menus (ui/).
//
// Each frame it:
//   1. advances the life simulation to "now" (real New York time),
//   2. moves the player and the camera, updates crowds, cars and ads,
//   3. sets the sky for the time of day and weather,
//   4. asks the director whether a random event should happen,
//   5. refreshes the on-screen HUD (only when something changed).
//
// Rules of thumb for anyone editing this file:
//   • Money ONLY changes through sim/economy.ts.
//   • Anything slow (building an area) happens behind a fade or a ride.
//   • Only one "thing" runs at a time: an action, a shift, a trip or an
//     event. `busy` guards that.
// =====================================================================

import { PLOT_BY_ID, PLOTS } from './data/plots.ts';
import { openPlotPanel } from './ui/plot-panel.ts';
import * as THREE from 'three';
import { VEHICLES } from './data/vehicles.ts';
import { vehicleGeometry, vehicleMaterial } from './world/vehicle-models.ts';
import { bus } from './core/bus.ts';
import { clockLabel, gameMinutesToRealMs, isRushHour, nowMs, nycTime } from './core/clock.ts';
import { MAP_MAX_DISTANCE, MAP_SPAN_FRACTION, MANHATTAN_BOUNDS, DETAIL_RADIUS, RIDESHARE, SUBWAY_FARE, TRAVEL_SECONDS, BLACK_CAR_REP, WALK_SPEED, INDOOR_WALK, SHIFT_GAME_HOURS, MAX_SHIFTS_PER_DAY, DIRECTOR_TICK_SECONDS, CAMERA } from './core/constants.ts';
import { esc, money } from './core/format.ts';
import { ACTIONS, actionLock } from './data/actions.ts';
import { CAREER_BY_ID, CAREERS } from './data/careers.ts';
import { doorOf, isOpen, PLACE_BY_ID, stationOf, type PlaceDef, type PlaceType } from './data/places.ts';
import { finishAction, startAction } from './sim/activity.ts';
import { changeMoney } from './sim/economy.ts';
import { RARITY, applyOutcome, buildContext, directorPick, EVENTS, type EventContext, type RandomEventDef } from './sim/events.ts';
import { checkGoal, currentGoal } from './sim/goals.ts';
import { advanceTo } from './sim/life.ts';
import { postDailyNews } from './sim/news.ts';
import { buyPrepaidPhone, checkPoliceReturn, PREPAID_PHONE_PRICE, reportToPolice } from './sim/phone.ts';
import { loadGame, saveGame, deleteGame } from './sim/save.ts';
import { newLife } from './sim/state.ts';
import { OPEN_AREAS, isOpenArea, type AreaId, type GameState, type Look } from './sim/types.ts';
import { weatherDef, weatherFor } from './sim/weather.ts';
import { applyForJob, jobTitle, quitJob, shiftBlocker } from './sim/work.ts';
import { Engine } from './render/engine.ts';
import { qualitySettings } from './render/quality.ts';
import { skyAt } from './render/sky.ts';
import { AdManager } from './world/ads.ts';
import { makeAvatar, type Avatar } from './world/avatar.ts';
import { loadFolk, type FolkAnim, type FolkKit } from './world/folk.ts';
import { kitNight, loadKits, type Kits } from './assets/kit.ts';
import { buildCity, setNightGlow, type BuiltCity } from './world/city.ts';
import { Crowd } from './world/crowd.ts';
import { buildInterior, type Interior } from './world/interior.ts';
import { buildHome, type HomeInterior } from './world/home-interior.ts';
import { loadFurnitureKit, type FurnitureKit } from './assets/furniture-kit.ts';
import { DesignMode } from './ui/design-mode.ts';
import { initThumbs } from './render/furniture-thumbs.ts';
import { setHomeAnisotropy, setHomeSurfaceDetail } from './render/home-surfaces.ts';
import { layoutForPlace, type HomeLayout } from './data/homes.ts';
import { VENUE_LAYOUT_FOR, VENUE_LAYOUTS, WORKPLACE_LAYOUTS, WORKPLACE_LAYOUT_FOR } from './data/venues.ts';
import { FURNITURE, FURNITURE_QUALITY, qualityLine, SHOP_ITEMS } from './data/furniture.ts';
import { buyFurniture } from './sim/shop.ts';
import { arriveHome, hasDoorman } from './sim/home-conditions.ts';
import { offerRaise, playRaiseGame } from './ui/raise-game.ts';
import { raiseBlocker, resolveRaise } from './sim/raise.ts';
import { resolveBribe, shiftTwist } from './sim/job-perks.ts';
import { afterWalk, changedClothes, stainAtWork, subwayIncident } from './sim/commute.ts';
import { Roommates } from './world/roommates.ts';
import { HINT_GAP_SECONDS, hintLevel, nextHint, whereFor, type HintLevel } from './sim/hints.ts';
import { showHint } from './ui/hints.ts';
import { buyCityMap } from './sim/citymap.ts';
import { Online } from './net/online.ts';
import { openChat, setOnline } from './ui/online-app.ts';
import { oddTwist } from './sim/oddities.ts';
import { beatLine, dateLines, dateOutLine, eatShared, joinParty, lend, lostLeftovers, maybeRepay, refuse, skipParty, type Beat } from './sim/roommate-life.ts';
import { InteriorView } from './world/interior-view.ts';
import { Coworkers } from './world/coworkers.ts';
import { addMoodlet, applyNeeds } from './sim/needs.ts';
import { assignRoom, assignVisitor, npcVisitors, type WorkRoom } from './sim/workroom.ts';
import { VenueLife } from './world/venue-life.ts';
import { CelebrationFx } from './world/celebration.ts';
import { BOTTLES, tradeWinShow, type Celebration } from './data/bottles.ts';
import { bottleDiscount, bottlePrice, buyBottle, chatAdmirer, goHomeWith } from './sim/celebrate.ts';
import { openFridge, openStove } from './ui/kitchen.ts';
import { receiveOrders } from './sim/kitchen.ts';
import { cookActionId, eatActionId, mealOfAction } from './data/groceries.ts';
import { openFurnitureShop } from './ui/furniture-shop.ts';
import { beginActivity, completeActivity, stopActivity, tickActivity, activityProgress } from './sim/home-activity.ts';
import { abandonShift, careerBand, finishDeliShift, menuFor, payBand, REAL_SHIFT_ORDERS, startDeliShift } from './sim/shift.ts';
import { autoSeconds, playDeliShift, shiftIntro, showPayslip } from './ui/deli-shift.ts';
import { openCloset } from './ui/closet.ts';
import { openStore } from './ui/store.ts';
import { openSidePanel } from './ui/side-panel.ts';
import { openAutoMode } from './ui/auto-mode.ts';
import { recordVariety } from './sim/auto.ts';
import { bustNow, levelBlockers, onPathAction, pathTitle, type Bust } from './sim/paths.ts';
import { chaseReady, chaseSetup, escaped as chaseEscaped, fightSetup, finishFight, heatFor, markChase } from './sim/brawl.ts';
import { playChase, playFight } from './ui/minigames.ts';
import { openChessHouse } from './ui/chess.ts';
import { openEasel, openGallery } from './ui/art.ts';
import { goFishing, openDerby } from './ui/fishing.ts';
import { raceBike } from './ui/cycling.ts';
import { artTick } from './sim/art.ts';
import { settleDerby } from './sim/fishing.ts';
import { rentBike } from './sim/cycling.ts';
import { addPoints, CHALLENGES, checkStreak, daily, POINTS, progress, rollSeason } from './sim/season.ts';
import type { ChessHost } from './ui/chess.ts';
import type { FishHost } from './ui/fishing.ts';
import type { BikeHost } from './ui/cycling.ts';
import type { ArtHost } from './ui/art.ts';
import { clubOf, doorCheck, mingle, payCover, topSpenders, tryBribe } from './sim/clubs.ts';
import { CONNECTION_BY_ID, type ClubDef } from './data/clubs.ts';
import { ClubScreen } from './world/club-screen.ts';
import { PATHS } from './data/paths.ts';
import { DISTRICTS, crossStreets, blockRect } from './world/layout.ts';
import { findPath, nearestWalkable } from './world/nav.ts';
import { SystemRunner, type SystemContext } from './core/systems.ts';
import './systems/index.ts';
import './sim/gang-events.ts';
import { syncJail } from './ui/jail.ts';
import { eventAt, joinEvent } from './data/city-events.ts';
import { openMap3D, type Map3D } from './ui/map3d.ts';
import { project } from './world/geo-proj.ts';
import { SAFE_AREAS, turfMap } from './sim/gangs.ts';
import { bindPeople, confront, openPerson, openSpeak, type PeopleHost } from './ui/people-ui.ts';
import { clearBubbles, updateBubbles } from './ui/bubbles.ts';
import { familiarFace, personOf } from './sim/people.ts';
import { arrest } from './sim/jail.ts';
import { driveTrip, drivingCar, GARAGE, licenceSuspended } from './sim/garage.ts';
import './ui/phone-apps.ts';
import { buildSubwayRide, type TransitScene } from './world/transit.ts';
import { installUiClicks, sfx, setAmbienceEnabled, setSoundEnabled, setVolumes } from './ui/audio.ts';
import { music } from './ui/music.ts';
import { soundscape, type Scene } from './ui/soundscape.ts';
import { nextTravelAd } from './ui/travel-ad.ts';
import { addRep, repLine } from './sim/rep.ts';
import { moveTo, moveBlocker, moveCost, listingName } from './sim/moving.ts';
import { closeSheet, fade, html, isSheetOpen, onAct, openModal, openSheet, progressBar, root, toast, wait } from './ui/dom.ts';
import { Hud, type NavKey } from './ui/hud.ts';
import { openBlackjack, openRocket, openRoulette, openSlots, casinoNetLine, rain, type CasinoHost } from './ui/casino.ts';
import { openPrizeCounter, playArcade } from './ui/arcade.ts';
import { openSportsbook, settleAndTell } from './ui/sportsbook.ts';
import { openWorkout } from './ui/workout.ts';
import { activeSection, buySection, endSectionIfOver, extendSection, friendSlots, inviteFriend, inviteList, nextSeatIn, SECTION } from './sim/section.ts';
import { SectionCrew } from './world/section-crew.ts';
import { Buddy } from './world/buddy.ts';
import { openHangout, type HangoutHost } from './ui/hangout.ts';
import { endHangout, expirePlans, flakes, maybeIncoming, otherOf, planHere, socialOf, startHangout } from './sim/invites.ts';
import { logWith, OUTINGS, tasteFor } from './sim/friends.ts';
import { freeloadersLeave, talkToGuest } from './sim/section.ts';

import { openMap } from './ui/map.ts';
import { clearPendingClass, runOnboarding } from './ui/onboarding.ts';
import { openPhone } from './ui/phone.ts';


/** The sit-down clip lowers the hips about this far: stand this much below a seat's top. */
const SEAT_DROP = 0.18;

export class Game {
  private engine: Engine;
  private state!: GameState;
  private city: BuiltCity | null = null;
  private crowd: Crowd | null = null;
  /** Plug-in systems (weather effects, traffic…): see core/systems.ts. */
  private systems = new SystemRunner();
  private ads: AdManager | null = null;
  private player: Avatar;
  /** Cartoon model packs (empty if they couldn't load: simple shapes are used). */
  private kits: Kits = {};
  /** False while a test hook has pointed the camera somewhere else. */
  private followCamera = true;
  private folk: FolkKit | null = null;
  private hud!: Hud;
  private interior: Interior | null = null;
  /** Workplace rooms (single-player: just yours) and the coworkers on screen. */
  private workRooms: WorkRoom[] = [];
  private coworkers: Coworkers | null = null;
  private venueLife: VenueLife | null = null;
  private party: CelebrationFx | null = null;
  /** 🛋️ Friends in your club section (world/section-crew.ts). */
  private sectionCrew: SectionCrew | null = null;
  private sectionChip: HTMLElement | null = null;
  /** 🤙 The friend you're hanging out with (world/buddy.ts), and its chip. */
  private buddy: Buddy | null = null;
  private hangoutChip: HTMLElement | null = null;
  private funTimer = 0;
  /** Your worker spot in the room, when you're at your own job. */
  private myWorkSpot: { x: number; z: number; rot: number } | null = null;
  /** The people you live with (the walk-up), while you're home. */
  private roommates: Roommates | null = null;
  /** This date's funny lines (picked once per date). */
  private dateLineCache: string[] | null = null;
  private transit: TransitScene | null = null;
  private interiorCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  /** Zoom and pan inside the big homes. */
  private view = new InteriorView(this.interiorCamera);
  /** The closet mirror's view (see openClosetMirror). */
  private mirrorCamera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  /** Home furniture models (loaded at boot; null = use the simple room). */
  private furniture: FurnitureKit | null = null;
  /** Home furniture loads after the city is up (boot); this is that load. */
  private furnitureLoad: Promise<unknown> | null = null;
  /** The furniture piece being moved in move mode (home only). */
  private moving: { uid: string; bar: HTMLElement } | null = null;
  /** The home design menu (ui/design-mode.ts), while it's open. */
  private design: DesignMode | null = null;
  /** A finger dragging the held piece (move mode). */
  /** Using a piece of furniture right now: the progress bar and how you're posed. */
  private doing: { bar: ReturnType<typeof progressBar>; uid?: string; standX: number; standZ: number } | null = null;
  private indoor: { points: { x: number; z: number }[]; then?: () => void; face?: THREE.Vector3 } | null = null;
  private drag: { id: number; dx: number; dz: number; moved: boolean; sx: number; sy: number } | null = null;

  private path: { x: number; z: number }[] = [];
  /** Place to open when the player reaches its door. */
  private headingTo: string | null = null;
  /** Walking over to talk to this person (sim/people.ts). */
  private talkingTo: string | null = null;
  private busy = false;
  private overlayClose: (() => void) | null = null;
  private directorTimer = 0;
  private simTimer = 0;
  private saveTimer = 0;
  private hudTimer = 0;
  private time = 0;
  private started = false;

  constructor(stage: HTMLElement) {
    const q = qualitySettings('auto');
    this.engine = new Engine(stage, q);
    this.player = makeAvatar({ body: 'f', skin: '#8d5524', top: '#e63946', bottom: '#111111', hair: '#111111' });
    this.engine.cityScene.add(this.player.root);
    this.engine.onTap((x, y) => this.onTap(x, y));
    this.setupFurnitureDrag();
    this.setupInteriorGestures();
    // The camera swings round the room: tell the home which walls to drop.
    this.view.onView = (x, z, mode) => {
      const home = this.interior as HomeInterior | null;
      if (home && 'setView' in home) home.setView(x, z, mode);
    };
    // Re-frame rooms when the phone rotates or the window changes size.
    window.addEventListener('resize', () => {
      if (this.engine.mode === 'interior') this.fitInteriorCamera(true);
    });
    // Test hooks for automated play-testing (only with ?qa in the address).
    if (new URLSearchParams(location.search).has('qa')) this.exposeTestHooks();
  }

  /** Lets scripts/qa-smoke.mjs drive the game without tapping 3D objects by pixel. */
  private exposeTestHooks(): void {
    (window as unknown as Record<string, unknown>).__nyc = {
      state: () => this.state,
      mode: () => this.engine.mode,
      openObject: (id: string) => {
        const o = this.interior?.objects.find((x) => x.id === id);
        if (o) this.openObjectSheet(o.label, o.emoji, o.actions, this.interior && (this.interior as HomeInterior).movable ? o.id : undefined);
        return !!o;
      },
      /** The first thing in the room that offers an action (QA). */
      objectWith: (actionId: string) => this.interior?.objects.find((o) => o.actions.includes(actionId))?.id ?? null,
      openPlace: (id: string) => this.openPlace(PLACE_BY_ID[id]),
      /** Names of the meshes whose world bounds cover (x, z) (debugging the map). */
      meshesAt: (x: number, z: number) => {
        const out: string[] = [];
        const box = new THREE.Box3();
        this.engine.cityScene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.geometry) return;
          const im = m as unknown as THREE.InstancedMesh;
          if (im.isInstancedMesh) {
            const mm = new THREE.Matrix4(), p = new THREE.Vector3();
            let hits = 0;
            for (let i = 0; i < im.count; i++) {
              im.getMatrixAt(i, mm);
              p.setFromMatrixPosition(mm).applyMatrix4(im.matrixWorld);
              if (Math.abs(p.x - x) < 60 && Math.abs(p.z - z) < 3) hits++;
            }
            if (hits) out.push(`instanced ${im.name || im.parent?.name} ×${hits}`);
            return;
          }
          const pos = m.geometry.getAttribute('position');
          if (pos) {
            const v = new THREE.Vector3();
            let hits = 0;
            for (let i = 0; i < pos.count; i++) {
              v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
              if (Math.abs(v.z - z) < 1.5 && Math.abs(v.x - x) < 150) hits++;
            }
            if (hits) out.push(`verts ${m.name || m.parent?.name || '?'} ×${hits}`);
          }
          m.geometry.computeBoundingBox();
          box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
          if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z && box.max.z - box.min.z < 40) out.push(`${m.name || m.parent?.name || '?'} z ${box.min.z.toFixed(0)}..${box.max.z.toFixed(0)} x ${box.min.x.toFixed(0)}..${box.max.x.toFixed(0)}`);
        });
        return out;
      },
      /** Sky map camera over (x, z) from `d` metres, `tilt` 0 = straight down (scripts/qa-shore.mjs). */
      sky: (x: number, z: number, d = 500, tilt = 0.6) => {
        if (this.engine.mode !== 'city' || !this.map3d) this.openCityMap();
        const { camera, controls } = this.engine;
        controls.maxDistance = Math.max(controls.maxDistance, d);
        controls.target.set(x, 0, z);
        camera.position.set(x, Math.cos(tilt) * d, z + Math.sin(tilt) * d);
        controls.update();
      },
      travel: (id: string) => this.travelSheet(PLACE_BY_ID[id]),
      door: (id: string) => doorOf(PLACE_BY_ID[id]),
      event: (id: string, where: EventContext['where'] = 'street') => {
        const ev = EVENTS.find((e) => e.id === id);
        if (ev) void this.showEvent(ev, where);
      },
      /** What a tap at (x, y) would hit, without doing anything. */
      whatsAt: (x: number, y: number) => {
        const c = this.city!;
        const door = this.engine.pick(x, y, c.doors.map((d) => d.hit));
        const ground = this.engine.pick(x, y, [...c.walkSurfaces, ...c.solids]);
        return { door: door?.object.userData.placeId ?? null, ground: ground ? ground.object.name || ground.object.type : null, point: ground ? { x: Math.round(ground.point.x), z: Math.round(ground.point.z) } : null };
      },
      /** Where the player is walking to (remaining waypoints). */
      path: () => this.path.map((w) => ({ x: Math.round(w.x), z: Math.round(w.z) })),
      /** Move the street camera to `d` metres from the player (for close-up screenshots). */
      zoom: (d: number, front = false) => {
        const { camera, controls } = this.engine;
        controls.minDistance = Math.min(CAMERA.minDistance, d);
        const offset = camera.position.clone().sub(controls.target).setLength(d);
        if (front) {
          // Swing round to face the player (the avatar looks down its +Z axis).
          const yaw = this.player.root.rotation.y;
          const up = d < 10 ? 0.45 : 0.85; // close-ups from eye level, wider shots from above
          offset.set(Math.sin(yaw) * d * 0.8, d * up, Math.cos(yaw) * d * 0.8);
        }
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
      /** Point the camera at a place (loads its area if needed) — for screenshots. */
      viewPlace: (id: string, d = 120, y = 30, ox = 0) => {
        const place = PLACE_BY_ID[id];
        if (!place) return false;
        if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
        const door = doorOf(place);
        const { camera, controls } = this.engine;
        controls.maxDistance = Math.max(CAMERA.maxDistance, d * 2);
        controls.target.set(door.x - door.faceX * 30 + ox, y, door.z - door.faceZ * 30);
        camera.position.set(controls.target.x + d * 0.55, controls.target.y + d * 0.35, controls.target.z + d * 0.75);
        controls.update();
        this.followCamera = false;
        return true;
      },
      /** People near the player, and talking to one (scripts/qa-people.mjs). */
      people: () => (this.crowd ? this.crowd.nearby(this.player.root.position.x, this.player.root.position.z, 150) : []),
      talk: (id: string) => id && this.talkTo(id),
      /** Point the sky-map camera at a real lat/lon from `dist` metres (scripts/qa-*.mjs). */
      skyLook: (lat: number, lon: number, dist = 400) => {
        const p = project(lat, lon);
        const { camera, controls } = this.engine;
        controls.target.set(p.x, 0, p.z);
        camera.position.set(p.x + dist * 0.15, dist * 0.8, p.z + dist * 0.6);
        controls.update();
      },
      /** The rentable billboards' centres (scripts/qa-*.mjs). */
      bigBoards: () => (this.city ? this.city.adBoards.boards : []),
      /** Open the rent sheet of a plot (scripts/qa-plots.mjs). */
      plot: (id: string) => PLOT_BY_ID[id] && openPlotPanel(PLOT_BY_ID[id]),
      plots: () => PLOTS.map((p) => ({ id: p.id, kind: p.kind, x: p.center.x, z: p.center.z })),
      /** Sky camera at a game x/z instead of lat/lon. */
      skyAt: (x: number, z: number, dist = 120) => {
        const { camera, controls } = this.engine;
        controls.target.set(x, 0, z);
        camera.position.set(x + dist * 0.15, dist * 0.8, z + dist * 0.6);
        controls.update();
      },
      /** Lock the player up for `hours` game hours (tests the jail screen). */
      jail: (hours = 6) => arrest(this.state, 'caught in the act', hours, 40_000),
      /** Line up every vehicle on a white floor for a screenshot (scripts/qa-cars.mjs). */
      carShow: (ids?: string[], cols = 4) => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#dfe9f3');
        scene.add(new THREE.HemisphereLight('#ffffff', '#b9c4cf', 1.6));
        const sun = new THREE.DirectionalLight('#ffffff', 2.2);
        sun.position.set(-6, 10, 8);
        scene.add(sun);
        const list = ids ? ids.map((i) => VEHICLES.require(i)) : VEHICLES.all();
        list.forEach((v, i) => {
          const m = new THREE.Mesh(vehicleGeometry(v, v.paints[0]), vehicleMaterial());
          m.position.set((i % cols) * 7 - (cols - 1) * 3.5, 0, Math.floor(i / cols) * 7.5);
          m.rotation.y = -0.6;
          scene.add(m);
        });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#eef2f6' }));
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        this.engine.altScene = scene;
        this.engine.altCamera = this.engine.camera;
        this.engine.mode = 'transit';
        const rows = Math.ceil(list.length / cols);
        const { camera, controls } = this.engine;
        controls.maxDistance = 500;
        controls.target.set(0, 0, (rows - 1) * 3.75);
        camera.position.set(0, 4 + rows * 2.2, (rows - 1) * 3.75 + 5 + rows * 3.2);
        camera.lookAt(controls.target);
        this.followCamera = false;
      },
      /** Jump straight inside a place (for screenshots of interiors). */
      enterPlace: (id: string) => {
        const p = PLACE_BY_ID[id];
        if (p) this.enterInterior(p, false);
        return !!p;
      },
      /** Where the player stands (for screenshots). */
      playerPos: () => ({ x: this.player.root.position.x, z: this.player.root.position.z }),
      /** Point the camera inside a home from (x, y, z) at (tx, 0.6, tz) — for close-up screenshots. */
      interiorCam: (x: number, y: number, z: number, tx: number, tz: number) => {
        const cam = this.engine.mode === 'interior' ? this.interiorCamera : this.engine.camera;
        cam.position.set(x, y, z);
        cam.lookAt(tx, Math.min(0.8, y * 0.7), tz);
        cam.updateProjectionMatrix();
      },
      /** Try on clothes without saving (for screenshots). */
      /** Force an activity animation on the player (null = back to normal). */
      anim: (name: FolkAnim | null) => this.player.setAction(name),
      /** Furniture QA: start move mode, list clashing pieces, where a piece is on screen. */
      moveFurniture: (uid: string) => this.startMoving(uid),
      doneMoving: (keep: boolean) => this.stopMoving(keep),
      furnitureClashes: () => (this.interior && 'clashes' in this.interior ? (this.interior as HomeInterior).clashes() : null),
      furnitureAt: (uid: string) => (this.interior && 'items' in this.interior ? (this.interior as HomeInterior).items.find((i) => i.uid === uid) ?? null : null),
      itemScreen: (uid: string) => {
        const it = this.interior && 'items' in this.interior ? (this.interior as HomeInterior).items.find((i) => i.uid === uid) : null;
        if (!it) return null;
        const v = new THREE.Vector3(it.x, 0.3, it.z).project(this.interiorCamera);
        const r = this.engine.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      floorScreen: (x: number, z: number) => {
        const v = new THREE.Vector3(x, 0, z).project(this.interiorCamera);
        const r = this.engine.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      walking: () => !!this.indoor,
      indoorRoute: () => (this.indoor ? this.indoor.points.map((q) => ({ ...q })) : null),
      resetCam: () => this.fitInteriorCamera(),
      storageSheet: () => this.openStorage(),
      design: () => this.openDesign(),
      designOpen: () => !!this.design,
      homeStyle: () => (this.interior && 'setStyle' in this.interior ? structuredClone((this.interior as HomeInterior).style) : null),
      setHomeStyle: (st: unknown) => (this.interior as HomeInterior).setStyle(st as never),
      previewHour: (h: number | null) => (this.interior as HomeInterior).previewHour(h),
      swing: (rad: number) => this.view.rotate(rad),
      topView: (on: boolean) => this.view.setTop(on),
      addPiece: (item: string, x: number, z: number) => (this.interior as HomeInterior).addPiece(item, x, z),
      setFinish: (uid: string, f: Record<string, string>) => (this.interior as HomeInterior).setFinish(uid, f),
      phoneApp: (id: string) => this.openPhoneApp(id),
      nowPlaying: () => music.title,
      /** QA: ads inside buildings / props on roads across the whole loaded area (should be []). */
      placementIssues: () => this.city?.placementIssues() ?? null,
      adSlotCount: () => this.city?.adSlots.length ?? 0,
      adReport: () => this.city?.adReport() ?? [],
      onRoadSweep: () => this.city?.onRoadSweep() ?? {},
      camDist: () => Math.round(this.engine.camera.position.distanceTo(this.engine.controls.target)),
      camTarget: () => ({ x: Math.round(this.engine.controls.target.x), z: Math.round(this.engine.controls.target.z) }),
      player: () => ({ x: this.player.root.position.x, z: this.player.root.position.z }),
      goWork: () => void this.goToWork(),
      clubScreen: () => this.clubScreen?.showing ?? null,
      fight: (power = 3) => this.runFight('Test Foe', '😤', power),
      chase: (heat = 1) => this.runChase(heat, 'QA chase.'),
      cops: (risk = 0.1) => this.copsSawYou({ pathId: 'crime', risk, lvl: 1, bail: 20_000 }, 'Testing'),
      panMap: (dx: number, dz: number) => {
        const sh = new THREE.Vector3(dx, 0, dz);
        this.engine.controls.target.add(sh);
        this.engine.camera.position.add(sh);
        this.engine.controls.update();
      },
      admirers: () => this.party?.admirers.map((x) => x.name) ?? [],
      section: () => this.state.section ?? null,
      sectionCrew: () => this.sectionCrew?.count ?? -1,
      service: (id: string) => this.serviceAction(id),
      social: () => socialOf(this.state),
      /** QA: someone in your contacts at a given friendship. */
      makeFriend: (id: string, likes: number) => {
        const m = (this.state.people[id] ??= { area: 'manhattan', met: nowMs(), seen: nowMs(), likes: 0, grudge: 0, level: 0, hasNumber: true, known: [], today: { day: '', acts: {} }, dates: 0 });
        m.hasNumber = true;
        m.likes = likes;
        m.level = likes >= 55 ? 3 : likes >= 30 ? 2 : likes >= 8 ? 1 : 0;
        return personOf(id).name;
      },
      buddy: () => !!this.buddy,
      /** QA: the newest plan starts in 3 seconds. */
      planNow: () => {
        const inv = socialOf(this.state).invites.find((i) => i.status === 'accepted');
        if (inv) ((inv.at = nowMs() + 3000), (inv.until = inv.at + 15 * 60_000));
        return inv?.placeId ?? null;
      },
      openHangout: () => openHangout(this.hangoutHost()),
      talkToAdmirer: (name: string) => this.talkToAdmirer(name),
      tradeWin: (mult: number) => this.celebrateTrade(mult),
      coworkers: () => this.coworkers?.list.map((c) => c.name) ?? [],
      visitors: () => this.venueLife?.count ?? 0,
      runnerDrinks: () => this.venueLife?.runnerDrinks ?? -1,
      work: () => void this.runShift(),
      myWorkSpot: () => this.myWorkSpot,
      askRaise: () => void this.maybeAskForRaise(),
      showFight: (won: boolean) => void this.showIncident({ kind: 'fight', won, text: won ? 'A guy tried you over a seat. A cloud of dust later, he got off at the next stop.' : 'A fight broke out over a seat and you lost. Urgent care: $40.' }),
      /** InstaDash: make every order arrive now (QA). */
      deliverNow: () => {
        for (const o of this.state.kitchen?.orders ?? []) o.arrivesAt = 0;
      },
      indoorWalking: () => !!this.indoor,
      walkInside: (x: number, z: number) => this.walkInside(x, z),
      zoomAt: (f: number, x: number, y: number) => this.view.zoomAt(f, x, y),
      view: () => ({ zoom: +this.view.zoom.toFixed(2), panX: +this.view.pan.x.toFixed(2), panZ: +this.view.pan.y.toFixed(2), enabled: this.view.enabled, seesPlayer: this.view.sees(this.player.root.position) }),
      playerScreen: () => {
        const p = this.player.root.position.clone().setY(0.8).project(this.interiorCamera);
        const el = this.engine.renderer.domElement.getBoundingClientRect();
        return { x: el.left + ((p.x + 1) / 2) * el.width, y: el.top + ((1 - p.y) / 2) * el.height };
      },
      money: () => this.state.money,
      job: () => this.state.job?.careerId ?? null,
      shiftOpen: () => !!this.state.shift,
      goal: () => currentGoal(this.state)?.title ?? null,
      setNeed: (k: keyof GameState['needs'], v: number) => { this.state.needs[k] = v; },
      animDebug: () => this.player.debug?.(),
      holdPose: (name: FolkAnim, at: number | null) => {
        this.player.setAction(name);
        this.player.setHold(at);
      },
      activity: () => (this.state.activity ? { ...this.state.activity, posed: !!this.doing } : null),
      stopDoing: () => this.stopDoing(true),
      needs: () => ({ ...this.state.needs }),
      storage: () => [...(this.state.storage ?? [])],
      homeItems: () => (this.interior && 'items' in this.interior ? (this.interior as HomeInterior).items.map((i) => ({ ...i })) : null),
      blockedUse: () => (this.interior && 'blockedUse' in this.interior ? (this.interior as HomeInterior).blockedUse() : null),
      roommates: () => this.roommates?.list.map((r) => ({ name: r.def.name, x: +r.avatar.root.position.x.toFixed(2), z: +r.avatar.root.position.z.toFixed(2), walking: r.path.length > 0, away: r.away, visible: r.avatar.root.visible, busy: r.script.length > 0 })) ?? [],
      roommateBeat: (kind: Beat['kind'], name?: string) => {
        const rm = this.roommates;
        if (!rm) return false;
        const who = name ?? rm.list[0].def.name;
        return rm.force({ kind, name: who, guest: kind === 'date' ? 'a QA tester' : undefined });
      },
      dateOn: () => !!this.roommates?.dateOn,
      online: () => this.online?.debug() ?? null,
      earnPoints: (n: number) => this.earn('qa', n),
      arcade: (id: string) => playArcade(this.funHost(), id, undefined, { phone: true }),
      /** QA: stand at (x, z) on the street. */
      placeAt: (x: number, z: number) => {
        this.path = [];
        this.player.root.position.set(x, this.player.root.position.y, z);
        this.state.location = { ...this.state.location, placeId: null, x, z };
      },
      onlineSay: (t: string) => this.online?.say(t),
      chatRoommate: (name: string) => this.chatWithRoommate(name),
      /** Try a spot for a piece the way a drag-and-drop would: returns why not (null = placed). */
      tryPlace: (uid: string, x: number, z: number) => {
        const home = this.interior as HomeInterior;
        home.beginMove(uid);
        home.dragTo(uid, x, z);
        const why = home.drop(uid);
        home.endMove(uid, false);
        this.saveHomeLayout();
        return why;
      },
      playerRot: () => ({ x: this.player.root.rotation.x, y: this.player.root.rotation.y, py: this.player.root.position.y }),
      /** Open the closet (with the mirror, when at home). */
      closet: () => this.openClosetMirror(),
      wardrobe: () => [...this.state.wardrobe],
      tryLook: (patch: Partial<Look>) => this.player.setLook({ ...this.state.profile.look, ...patch }),
      /** Heaviest visible meshes (name, triangles) — for performance checks. */
      /** Visible, in-frustum meshes counted by name (what the draw calls are). */
      callBreakdown: () => {
        const cam = this.engine.camera;
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const out: Record<string, number> = {};
        this.engine.cityScene.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh && !(o as THREE.LineSegments).isLineSegments) return;
          if (m.frustumCulled && m.geometry) {
            if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
            const sph = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
            if (!fr.intersectsSphere(sph)) return;
          }
          const k = (m.name || `${m.type}<${m.parent?.name ?? ''}>`).replace(/-\d.*$/, '');
          out[k] = (out[k] ?? 0) + 1;
        });
        return out;
      },
      meshStats: () => {
        const rows: [string, number][] = [];
        this.engine.cityScene.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = m.geometry;
          const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
          const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
          rows.push([m.name || m.type, Math.round(tris * n)]);
        });
        return rows.sort((a, b) => b[1] - a[1]).slice(0, 15);
      },
      /** Triangles on screen grouped by kind (frustum-culled), for performance checks. */
      triBreakdown: () => {
        const cam = this.engine.camera;
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const out: Record<string, number> = {};
        this.engine.cityScene.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.geometry) return;
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const sph = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
          if (m.frustumCulled && !fr.intersectsSphere(sph)) return;
          const g = m.geometry;
          const tris = ((g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
          const k = (m.name || m.type).replace(/[-_].*$/, '');
          out[k] = Math.round((out[k] ?? 0) + tris);
        });
        return { shadows: this.engine.renderer.shadowMap.enabled, ...out };
      },
      /** The game clock's current hour (0-23). */
      hour: () => nycTime().hour,
      fps: () => Math.round(this.engine.fps),
      drawCalls: () => this.engine.renderer.info.render.calls,
      triangles: () => this.engine.renderer.info.render.triangles,
    };
  }

  // ===================================================================
  // Boot
  // ===================================================================

  async boot(): Promise<void> {
    // Cartoon model packs. Waits at most a few seconds: on a very slow
    // connection the game starts with simple shapes instead of hanging.
    const timeout = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => window.setTimeout(() => r(fallback), ms))]);
    performance.mark('boot:start');
    const marked = <T,>(p: Promise<T>, name: string) => p.then((v) => (performance.mark(name), v));
    // Only what the street needs holds up the start (street props, people).
    // Home furniture is only needed indoors: it loads once the city is up.
    const [kits, folk] = await Promise.all([timeout(marked(loadKits(), 'models:kits'), 12000, {} as Kits), timeout(marked(loadFolk().catch(() => null), 'models:folk'), 12000, null)]);
    performance.mark('boot:models');
    const furnitureReady = () => (this.furnitureLoad ??= timeout(marked(loadFurnitureKit(), 'models:furniture'), 12000, null).then((f) => {
      this.furniture = f;
      if (f) initThumbs(this.engine.renderer, f);
      setHomeSurfaceDetail(this.engine.quality.tier === 'low');
      setHomeAnisotropy(Math.min(4, this.engine.renderer.capabilities.getMaxAnisotropy()));
      return f;
    }));
    this.kits = kits;
    this.folk = folk;
    const loaded = loadGame();
    if (loaded) {
      this.state = loaded;
      // A shift left unfinished (closed mid-shift): it ends, unpaid.
      const walkedOut = abandonShift(this.state);
      this.applySettings();
      const summary = advanceTo(this.state);
      this.loadArea(this.state.location.area);
      this.placePlayerAtLocation();
      await this.engine.warmUp();
      this.engine.start((dt) => this.frame(dt));
      this.finishBoot();
      if (summary) window.setTimeout(() => toast(summary, { icon: '🕐', ms: 6000 }), 900);
      if (walkedOut) window.setTimeout(() => toast('You left in the middle of your last shift, so it wasn’t paid', { icon: '🥪', ms: 4500 }), 1400);
      if (this.state.location.placeId) {
        await furnitureReady();
        this.enterInterior(PLACE_BY_ID[this.state.location.placeId], false);
      } else window.setTimeout(() => void furnitureReady(), 500);
      return;
    }

    // First visit: show the city behind the character screen.
    this.loadArea('manhattan');
    const hub = DISTRICTS.manhattan.hub;
    const b = blockRect(DISTRICTS.manhattan, hub.c, hub.r);
    this.player.root.position.set((b.minX + b.maxX) / 2, 0.2, (b.minZ + b.maxZ) / 2 + 10);
    this.engine.controls.target.set(this.player.root.position.x, 2, this.player.root.position.z);
    this.engine.camera.position.set(this.player.root.position.x + 9, 7, this.player.root.position.z + 16);
    await this.engine.warmUp();
    this.engine.start((dt) => this.frame(dt));
    document.querySelector('.loading')?.classList.add('done');
    window.setTimeout(() => void furnitureReady(), 300); // while they make their character
    const opts = await runOnboarding((look: Look) => this.player.setLook(look));
    this.state = newLife(opts);
    this.player.setLook(opts.look);
    postDailyNews(this.state, nycTime().dateKey);
    this.applySettings();
    this.placePlayerAtLocation();
    this.finishBoot();
    await furnitureReady();
    this.enterInterior(PLACE_BY_ID[this.state.home.placeId], false);
    toast(`Welcome to New York, ${opts.name}!`, { icon: '🗽', tone: 'good', ms: 4000 });
    this.save();
    clearPendingClass(); // the class is in the save now
  }

  private finishBoot(): void {
    this.player.setLook(this.state.profile.look);
    bindPeople(this.peopleHost());
    // 🔥 Welcome back (a streak of real days), and last season's result.
    const season = rollSeason(this.state);
    const streak = checkStreak(this.state);
    [streak, season].filter(Boolean).forEach((l, i) => window.setTimeout(() => toast(l!, { icon: i ? '🏆' : '🔥', tone: 'good', ms: 5000 }), 2500 + i * 2200));
    this.hud = new Hud({
      onNav: (w) => this.onNav(w),
      onMoney: () => this.openPhoneApp('bank'),
      onWork: () => void this.goToWork(),
      onSpeak: () => {
        if (this.busy || this.engine.mode !== 'city') return;
        sfx.tap();
        openSpeak(this.peopleHost());
      },
      onVolume: () => this.toggleMuteAll(),
      onMenu: () => {
        if (this.busy) return;
        sfx.tap();
        openSidePanel(this.state, (a) => {
          if (a.kind === 'phone') this.openPhoneApp(a.app);
          else if (a.kind === 'map') this.openCityMap();
          else if (a.kind === 'auto') openAutoMode(this.state, () => this.save());
          else if (a.kind === 'place') {
            const p = PLACE_BY_ID[a.placeId];
            if (p) this.openPlace(p);
          }
        });
      },
    });
    this.hud.setMuted(!this.state.settings.sound);
    this.started = true;
    this.startOnline();
    document.querySelector('.loading')?.classList.add('done');
    bus.on('pin:tap', (e) => {
      const p = PLACE_BY_ID[e.placeId];
      if (p) this.openPlace(p);
    });
    bus.on('money:changed', (e) => {
      if (e.delta > 0 && e.delta >= 500) sfx.cash();
    });
    // The phone took the 3D view away and didn't give it back: save, then offer a reload.
    window.addEventListener('nyc:gl-lost', () => {
      this.save();
      if (document.querySelector('.gl-lost')) return;
      const m = openModal(`<div class="big">🌆</div><h2>The city needs a quick reload</h2><p>Your phone paused the 3D view to save memory. Your game is saved.</p><button class="btn primary block" data-act="reload">Reload</button>`);
      m.el.classList.add('gl-lost');
      onAct(m.el, () => location.reload());
    });
    // Save when the tab is hidden or closed (phones kill background tabs).
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    window.addEventListener('pagehide', () => this.save());
    this.refreshHud(true);
  }

  private uiClicks = false;
  private wheelForward = false;
  private soundPos = new THREE.Vector3();

  /** Ambience for where you are, footsteps, the sound of what you're doing (ui/soundscape.ts). */
  private updateSound(dt: number, hour: number): void {
    const p = this.player.root.position;
    const speed = dt > 0 ? Math.min(12, p.distanceTo(this.soundPos) / dt) : 0;
    this.soundPos.copy(p);
    const mode = this.engine.mode;
    const place = this.state.location.placeId ? PLACE_BY_ID[this.state.location.placeId] : null;
    const scene: Scene = mode === 'transit' ? 'transit' : mode === 'interior' && place ? (place.interior as Scene) : 'city';
    soundscape.update(dt, { scene, hour, speed, activity: this.doing ? (this.state.activity?.actionId ?? null) : null });
  }

  /** 🔊 in the top bar: mute or unmute everything in one tap (Peter, 2026-10-15). */
  private toggleMuteAll(): void {
    const st = this.state.settings;
    st.sound = !st.sound;
    this.applySound();
    this.save();
    toast(st.sound ? 'Sound on' : 'Sound off', { icon: st.sound ? '🔊' : '🔇', ms: 1200 });
  }

  /** Push the sound settings (on/off, music on/off, volumes) into the audio system. */
  private applySound(): void {
    const st = this.state.settings;
    setSoundEnabled(st.sound);
    if (!st.sound) soundscape.silence();
    setAmbienceEnabled(st.music !== false);
    music.setEnabled(st.music !== false && st.sound);
    setVolumes((st.musicVol ?? 70) / 100, (st.sfxVol ?? 80) / 100);
    this.hud?.setMuted?.(!st.sound);
  }

  private applySettings(): void {
    setSoundEnabled(this.state.settings.sound);
    this.applySound();
    if (!this.uiClicks) {
      this.uiClicks = true;
      installUiClicks();
    }
    if (!this.wheelForward) {
      // Scrolling over map labels or street pins still zooms the map underneath
      // (they used to swallow the wheel, so zoom stalled when labels were under the mouse).
      this.wheelForward = true;
      document.addEventListener(
        'wheel',
        (e) => {
          const t = e.target as HTMLElement | null;
          if (!t?.closest?.('.map3d, .pin-layer, .map-fast') || e.target === this.engine.renderer.domElement) return;
          e.preventDefault();
          this.engine.renderer.domElement.dispatchEvent(new WheelEvent('wheel', e));
        },
        { passive: false, capture: true },
      );
    }
    const q = qualitySettings(this.state.settings.quality);
    this.engine.quality = q;
    this.engine.renderer.setPixelRatio(q.pixelRatio);
  }

  // ===================================================================
  // Areas
  // ===================================================================

  private loadArea(area: AreaId): void {
    this.ads?.dispose();
    this.crowd?.dispose();
    this.systems.areaUnloaded();
    this.city?.dispose();
    const q = this.engine.quality;
    performance.mark('area:start');
    this.city = buildCity(area, { trees: q.trees, shadows: q.shadows, kits: this.kits, detailScale: q.tier === 'low' ? 0.75 : 1 });
    this.engine.cityScene.add(this.city.group);
    performance.mark('area:city');
    this.crowd = new Crowd(this.city.nav, area, q.crowd, this.folk ?? undefined, q.tier === 'low' ? 6 : q.tier === 'medium' ? 12 : 20);
    this.engine.cityScene.add(this.crowd.group);
    this.crowd.familiar = (taken) => (this.state ? familiarFace(this.state, area, taken) : null);
    clearBubbles();
    this.systems.areaLoaded(this.systemContext());
    this.ads = new AdManager(this.city.adSlots, q.tier);
    bus.emit('area:changed', { area });
    performance.mark('area:done');
  }

  /** Switch between the city, an interior and the subway view (tells listeners). */
  private setMode(mode: 'city' | 'interior' | 'transit'): void {
    this.engine.mode = mode;
    bus.emit('view:mode', { mode });
  }

  /** What plug-in systems get to see (core/systems.ts). */
  private systemContext(): SystemContext {
    const t = nycTime();
    return {
      scene: this.engine.cityScene,
      camera: this.engine.camera,
      player: this.player.root.position,
      district: DISTRICTS[this.city?.area ?? 'manhattan'],
      quality: this.engine.quality,
      state: this.state,
      time: t,
      weather: weatherFor(t.dateKey, t.hour),
    };
  }

  private placePlayerAtLocation(): void {
    const loc = this.state.location;
    this.player.root.position.set(loc.x, 0.2, loc.z);
    this.engine.controls.target.set(loc.x, 2, loc.z);
    // High and a little tilted (Peter: more top-down and further out, so the
    // street-level ad spaces show): about 30° from straight down.
    const d = CAMERA.startDistance;
    this.engine.camera.position.set(loc.x + d * 0.2, d * 0.88, loc.z + d * 0.44);
    this.path = [];
  }

  // ===================================================================
  // Frame loop
  // ===================================================================

  private frame(dt: number): void {
    this.time += dt;
    const t = nycTime();
    if (this.started) this.online?.update(dt);

    if (this.started) {
      // Simulation: cheap, but no need to run it 60 times a second.
      this.simTimer += dt;
      if (this.simTimer >= 1) {
        this.simTimer = 0;
        const note = advanceTo(this.state);
        if (note) toast(note, { icon: '📅', ms: 5000 });
        const police = checkPoliceReturn(this.state);
        if (police) toast(police, { icon: '📱', tone: 'good', ms: 5000 });
        const g = checkGoal(this.state);
        if (g) {
          toast(`Goal done: ${g.title} · +${money(g.reward)}`, { icon: '🎯', tone: 'good', ms: 3800 });
          sfx.notify();
        }
      }
      this.saveTimer += dt;
      if (this.saveTimer > 15) {
        this.saveTimer = 0;
        this.save();
      }
      // Entertainment: section timer, finished bets (once a second).
      this.funTimer += dt;
      if (this.funTimer >= 1) {
        this.funTimer = 0;
        this.funTick();
      }
      this.directorTimer += dt;
      if (this.directorTimer >= DIRECTOR_TICK_SECONDS) {
        this.directorTimer = 0;
        this.maybeRandomEvent();
        this.maybeConfrontation();
      }
    }

    // ---- sky & lighting
    const weather = weatherFor(t.dateKey, t.hour);
    const sky = skyAt(t.hourFloat, weather);
    const scene = this.engine.cityScene;
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color();
    scene.background.copy(sky.sky);
    (scene.fog as THREE.Fog).color.copy(sky.fog);
    this.engine.hemi.intensity = sky.hemi;
    this.engine.sun.intensity = sky.sun;
    this.engine.sun.color.copy(sky.sunColor);
    setNightGlow(sky.glow * 1.1);
    kitNight.value = sky.glow;
    this.engine.followSun(this.player.root.position, sky.sunDir);

    if (this.engine.mode === 'city' && this.city) {
      this.updatePlayer(dt);
      const camDist = this.engine.camera.position.distanceTo(this.engine.controls.target);
      // Street details (signs, awnings, posters) only near the focus; zoomed far out they'd be specks.
      this.city.updateLod(this.engine.controls.target, Math.min(DETAIL_RADIUS + camDist * 0.6, camDist > 300 ? 170 : 400), camDist);
      this.city.updateSeeThrough(this.engine.camera.position, this.player.root.position, dt);
      this.city.tick(dt);
      const hub = DISTRICTS[this.city.area].hub;
      const hb = blockRect(DISTRICTS[this.city.area], hub.c, hub.r);
      const hubX = (hb.minX + hb.maxX) / 2;
      const hubZ = (hb.minZ + hb.maxZ) / 2;
      this.crowd?.update(dt, this.engine.controls.target, t.hour, (x, z) => (Math.hypot(x - hubX, z - hubZ) < 160 ? 1.5 : 1));
      this.systems.update(dt, this.systemContext());
      this.ads?.update(dt, this.engine.camera);
      // Door rings gently pulse so you notice them.
      const pulse = 0.55 + Math.sin(this.time * 3) * 0.3;
      this.city.group.traverse((o) => {
        if (o.userData.pulse) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse;
      });
    } else if (this.engine.mode === 'interior' && this.interior) {
      this.interior.update(dt);
      this.buddy?.update(dt);
      this.player.animate(this.walkIndoors(dt), dt);
      // Zoomed in: keep yourself in view while you walk somewhere.
      if (this.indoor || this.doing) this.view.follow(this.player.root.position, dt);
      this.view.tick(dt);
      this.tickDoing();
      const ring = this.tapRing;
      if (ring?.visible) {
        ring.userData.t += dt;
        const k = ring.userData.t / 0.6;
        ring.scale.setScalar(1 + k * 0.8);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
        if (k >= 1) ring.visible = false;
      }
    } else if (this.engine.mode === 'transit' && this.transit) {
      this.transit.update(dt);
    }

    if (this.started) this.updateSound(dt, t.hour);
    if (this.started) this.syncCar();
    if (this.map3d) {
      const el = this.engine.renderer.domElement;
      this.map3d.update(this.engine.camera, el.clientWidth, el.clientHeight, this.engine.camera.position.distanceTo(this.engine.controls.target));
    }
    if (this.started) {
      const el = this.engine.renderer.domElement;
      updateBubbles(this.engine.camera, el.clientWidth, el.clientHeight, this.engine.mode === 'city');
    }
    if (this.started) {
      this.hudTimer += dt;
      if (this.hudTimer > 0.25) {
        this.hudTimer = 0;
        this.checkDeliveries();
        this.refreshHud();
      }
    }
  }

  /**
   * Walking around inside: follow the waypoints (picked around furniture
   * and walls by the home's walk grid), turning smoothly, then run
   * whatever was waiting for you to arrive (opening a piece's actions).
   * Returns the ground speed for the walk animation.
   */
  private walkIndoors(dt: number): number {
    const route = this.indoor;
    if (!route) return 0;
    const p = this.player.root.position;
    const wp = route.points[0];
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.06) {
      route.points.shift();
      if (!route.points.length) {
        this.indoor = null;
        if (route.face) this.player.root.rotation.y = Math.atan2(route.face.x - p.x, route.face.z - p.z);
        route.then?.();
      }
      return route.points.length ? INDOOR_WALK : 0;
    }
    const step = Math.min(dist, INDOOR_WALK * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    let diff = Math.atan2(dx, dz) - this.player.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.player.root.rotation.y += diff * Math.min(1, dt * 12);
    return INDOOR_WALK;
  }

  /** A ring that pops where you tapped the floor indoors, then fades. */
  private tapRing: THREE.Mesh | null = null;
  private showTapRing(at: THREE.Vector3): void {
    if (!this.interior) return;
    if (!this.tapRing) {
      this.tapRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 28), new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, depthWrite: false }));
      this.tapRing.rotation.x = -Math.PI / 2;
      this.tapRing.renderOrder = 4;
    }
    const r = this.tapRing;
    if (r.parent !== this.interior.scene) this.interior.scene.add(r);
    r.position.set(at.x, 0.05, at.z);
    r.userData.t = 0;
    r.visible = true;
  }

  /** Walk somewhere indoors (around the furniture). Homes walk; other rooms jump straight there. */
  private walkInside(x: number, z: number, then?: () => void, face?: THREE.Vector3): void {
    const home = this.interior as HomeInterior | null;
    const p = this.player.root.position;
    const pts = home && 'walkPath' in home ? home.walkPath(p.x, p.z, x, z) : [{ x, z }];
    if (!pts || !pts.length) {
      this.indoor = null;
      return toast('Can’t get there', { icon: '🚧', ms: 1400 });
    }
    if (!home || !('walkPath' in home)) {
      p.set(x, 0, z);
      if (face) this.player.root.rotation.y = Math.atan2(face.x - x, face.z - z);
      return then?.();
    }
    this.player.setAction(null);
    this.indoor = { points: pts, then, face };
  }

  private updatePlayer(dt: number): void {
    const p = this.player.root.position;
    let speed = 0;
    if (this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - p.x;
      const dz = wp.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        this.path.shift();
        if (!this.path.length) this.arrived();
      } else {
        const walk = WALK_SPEED * (this.state.garage.driving ? GARAGE.driveSpeed : 1);
        const step = Math.min(dist, walk * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        speed = WALK_SPEED;
        const target = Math.atan2(dx, dz);
        let diff = target - this.player.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.player.root.rotation.y += diff * Math.min(1, dt * 10);
      }
      this.state.location.x = p.x;
      this.state.location.z = p.z;
    }
    this.player.animate(speed, dt);
    this.player.setDetail(this.engine.camera.position.distanceTo(this.engine.controls.target));
    // Camera follows the player, keeping whatever angle and zoom you chose.
    if (!this.followCamera) return;
    const target = this.engine.controls.target;
    const before = target.clone();
    target.lerp(new THREE.Vector3(p.x, 2, p.z), Math.min(1, dt * 6));
    this.engine.camera.position.add(target.clone().sub(before));
  }

  private arrived(): void {
    if (this.talkingTo) {
      const id = this.talkingTo;
      this.talkingTo = null;
      if (this.crowd?.where(id)) this.talkTo(id);
      return;
    }
    if (!this.headingTo) return;
    const place = PLACE_BY_ID[this.headingTo];
    this.headingTo = null;
    if (place) this.openPlace(place);
  }

  // ===================================================================
  // Input
  // ===================================================================

  private onTap(x: number, y: number): void {
    if (!this.started || this.busy || this.overlayClose) return;
    sfx.tap();
    if (this.engine.mode === 'interior' && this.interior && this.moving) {
      // Move mode: tap the floor to put the piece there.
      // (A press on the piece itself is a grab, not a tap: see setupFurnitureDrag.)
      if (this.drag) return;
      const home = this.interior as HomeInterior;
      const hit = this.engine.pick(x, y, home.floors, this.interiorCamera);
      if (!hit) return;
      home.dragTo(this.moving.uid, hit.point.x, hit.point.z);
      const why = home.drop(this.moving.uid);
      if (why) toast(`${why}, so it went back`, { icon: '↩️', ms: 2000 });
      return;
    }
    if (this.engine.mode === 'interior' && this.interior && this.design?.open && this.design.onTap(x, y)) return;
    if (this.engine.mode === 'interior' && this.interior) {
      // Tapping anything while busy with a piece: get up first.
      if (this.doing) this.stopDoing(true);
      const mateHit = this.roommates ? this.engine.pick(x, y, this.roommates.hits, this.interiorCamera) : null;
      if (mateHit && this.roommates) return this.chatWithRoommate(mateHit.object.userData.roommate as string);
      const fanHit = this.party?.admirers.length ? this.engine.pick(x, y, this.party.hits, this.interiorCamera) : null;
      if (fanHit) return this.talkToAdmirer(fanHit.object.userData.admirer as string);
      const crewHit = this.coworkers ? this.engine.pick(x, y, this.coworkers.hits, this.interiorCamera) : null;
      if (crewHit) return this.greetCoworker(crewHit.object.userData.coworker as string);
      const hit = this.engine.pick(x, y, this.interior.objects.map((o) => o.mesh), this.interiorCamera);
      const id = hit?.object.userData.objectId as string | undefined;
      const obj = id ? this.interior.objects.find((o) => o.id === id) : undefined;
      if (obj) {
        // Walk over to it, face it, then show what you can do with it.
        const centre = obj.mesh.getWorldPosition(new THREE.Vector3()).setY(0);
        const movable = (this.interior as HomeInterior).movable ? obj.id : undefined;
        const homeItem = 'items' in this.interior ? (this.interior as HomeInterior).items.find((i) => i.uid === obj.id) : undefined;
        // The clothes rack / closet opens your clothes straight away.
        const closet = homeItem && FURNITURE.get(homeItem.item)?.opens === 'closet';
        // In the furniture store, every floor model (and the counter) opens the catalog.
        const here = this.state.location.placeId ? PLACE_BY_ID[this.state.location.placeId] : null;
        if (here?.interior === 'furniture') {
          const shown = homeItem && SHOP_ITEMS.includes(homeItem.item) ? homeItem.item : undefined;
          return this.walkInside(obj.stand.x, obj.stand.z, () => this.openShop(shown), centre);
        }
        return this.walkInside(obj.stand.x, obj.stand.z, () => (closet ? this.openClosetMirror(obj.id) : this.openObjectSheet(obj.label, obj.emoji, obj.actions, movable)), centre);
      }
      // The floor: just walk there.
      const home = this.interior as HomeInterior;
      const floorHit = 'floors' in home ? this.engine.pick(x, y, home.floors, this.interiorCamera) : null;
      if (floorHit) {
        this.showTapRing(floorHit.point);
        this.walkInside(floorHit.point.x, floorHit.point.z);
      }
      return;
    }
    if (this.engine.mode !== 'city' || !this.city) return;
    // 1) A door? 2) A billboard? 3) The ground: walk there.
    const doorHit = this.engine.pick(x, y, this.city.doors.map((d) => d.hit));
    if (doorHit) {
      const placeId = doorHit.object.userData.placeId as string;
      return this.walkToPlace(placeId);
    }
    // A person? Talk to them (walk over first if they're far).
    const el = this.engine.renderer.domElement;
    const who = this.crowd?.pick(x, y, this.engine.camera, el.clientWidth, el.clientHeight);
    if (who) {
      const p = this.player.root.position;
      if (Math.hypot(who.x - p.x, who.z - p.z) < 5) return this.talkTo(who.personId);
      this.headingTo = null;
      this.talkingTo = who.personId;
      this.crowd!.hold(who.personId, 12, p.x, p.z);
      return this.walkTo(who.x, who.z);
    }
    // An ad block half or an island panel?
    const boardHit = this.engine.pick(x, y, [this.city.adBoards.faces]);
    const board = boardHit?.faceIndex != null ? this.city.adBoards.boardAt(boardHit.faceIndex) : null;
    if (board && PLOT_BY_ID[board.plotId]) return openPlotPanel(PLOT_BY_ID[board.plotId], board.unit);
    const adHit = this.engine.pick(x, y, this.city.adSlots.map((s) => s.mesh));
    // Ground and walls together: whichever is hit first wins, so tapping a
    // building doesn't walk you to the hidden ground behind it.
    const groundHit = this.engine.pick(x, y, [...this.city.walkSurfaces, ...this.city.solids]);
    if (adHit && (!groundHit || adHit.point.distanceTo(this.engine.camera.position) < groundHit.point.distanceTo(this.engine.camera.position))) {
      return this.openAdCard(adHit.object.userData.adSlotId as string);
    }
    if (groundHit) {
      this.headingTo = null;
      // A wall hit: aim for the sidewalk at the foot of that wall.
      const target = this.city.solids.includes(groundHit.object) ? nearestWalkable(this.city.nav, groundHit.point.x, groundHit.point.z) : groundHit.point;
      this.walkTo(target.x, target.z);
    }
  }

  private walkTo(x: number, z: number): void {
    if (!this.city) return;
    const p = this.player.root.position;
    const path = findPath(this.city.nav, p.x, p.z, x, z);
    if (!path.length) {
      const near = nearestWalkable(this.city.nav, x, z);
      this.path = findPath(this.city.nav, p.x, p.z, near.x, near.z);
    } else this.path = path;
    if (this.state.location.placeId) this.state.location.placeId = null;
  }

  private walkToPlace(placeId: string): void {
    const place = PLACE_BY_ID[placeId];
    const door = doorOf(place);
    const p = this.player.root.position;
    if (Math.hypot(door.x - p.x, door.z - p.z) < 3) return this.openPlace(place);
    this.headingTo = placeId;
    this.walkTo(door.x, door.z);
  }

  private onNav(which: NavKey): void {
    if (this.busy) return;
    sfx.tap();
    if (which === 'places') return this.openPlacesList();
    if (which === 'storage') return this.openDesign();
    if (which === 'leave') {
      // At home, stroll to the front door first.
      const home = this.interior as HomeInterior | null;
      if (home && 'walkPath' in home && home.movable && this.engine.mode === 'interior') {
        const hd = home.layout.depth / 2;
        return this.walkInside(0, hd - 0.35, () => this.leaveInterior());
      }
      return this.leaveInterior();
    }
    if (which === 'phone') return this.openPhoneApp();
    if (which === 'map') return this.openQuickTravel();
    // "Here": the nearest place within a short walk, else the cross streets.
    const p = this.player.root.position;
    let best: PlaceDef | null = null;
    let bestD = 40;
    for (const pl of Object.values(PLACE_BY_ID)) {
      if (pl.area !== this.state.location.area) continue;
      const d = doorOf(pl);
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < bestD) {
        best = pl;
        bestD = dist;
      }
    }
    if (best) this.walkToPlace(best.id);
    else toast(`Nothing right here. Open the Map to find places.`, { icon: '🗺️' });
  }

  // ===================================================================
  // Places
  // ===================================================================

  /**
   * 🏙️ Places (Peter, 2026-10-15: "a button that shows all locations"):
   * every place in the area, by kind, nearest first, with a search box.
   * Tap one for the usual ways to get there.
   */
  private openPlacesList(): void {
    const s = this.state;
    const p = this.engine.mode === 'city' ? this.player.root.position : new THREE.Vector3(s.location.x, 0, s.location.z);
    const h = nycTime().hour;
    const GROUPS: [PlaceType, string][] = [['fun', '🎲 Fun'], ['food', '🍕 Food'], ['cafe', '☕ Cafés'], ['nightlife', '🪩 Nightlife'], ['shop', '🛍️ Shops'], ['fitness', '💪 Fitness'], ['work', '💼 Work'], ['park', '🌳 Parks'], ['plaza', '🏙️ Plazas'], ['landmark', '🗽 Landmarks'], ['station', '🚇 Stations'], ['home', '🏠 Homes']];
    const all = Object.values(PLACE_BY_ID)
      .filter((pl) => pl.area === s.location.area)
      .map((pl) => {
        const d = doorOf(pl);
        return { pl, m: Math.hypot(d.x - p.x, d.z - p.z) };
      })
      .sort((a, b) => a.m - b.m);
    const mins = (m: number) => Math.max(1, Math.round(m / 80));
    const row = ({ pl, m }: { pl: PlaceDef; m: number }) => {
      const open = isOpen(pl, h);
      const home = pl.id === s.home.placeId;
      return `<button class="opt" data-act="go:${pl.id}" data-q="${esc(`${pl.name} ${pl.type} ${pl.interior} ${pl.blurb}`.toLowerCase())}"><span style="font-size:22px">${home ? '🏠' : pl.emoji}</span><span class="grow"><b>${esc(home ? `Home · ${pl.name}` : pl.type === 'home' ? listingName(s, pl) : pl.name)}</b><small>${mins(m)} min walk · ${open ? '<span style="color:var(--good)">open</span>' : 'closed'}</small></span></button>`;
    };
    const body = GROUPS.map(([type, label]) => {
      const list = all.filter((x) => x.pl.type === type);
      return list.length ? `<section data-group><h3 style="margin:12px 0 6px;font-size:15px">${label} <span class="sub" data-count>${list.length}</span></h3><div class="travel">${list.map(row).join('')}</div></section>` : '';
    }).join('');
    const sheet = openSheet({
      emoji: '🏙️',
      title: 'Places',
      sub: `${all.length} places in ${DISTRICTS[s.location.area].name} · nearest first`,
      body: `<input class="input" data-search type="search" placeholder="Search: pizza, gym, club…" aria-label="Search places" style="width:100%;margin-bottom:6px">${body}`,
    });
    const input = sheet.body.querySelector<HTMLInputElement>('[data-search]')!;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      sheet.body.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => (b.hidden = !!q && !b.dataset.q!.includes(q)));
      sheet.body.querySelectorAll<HTMLElement>('[data-group]').forEach((g) => {
        const n = g.querySelectorAll('[data-q]:not([hidden])').length;
        g.hidden = !n;
        const c = g.querySelector('[data-count]');
        if (c) c.textContent = String(n);
      });
    });
    onAct(sheet.body, (act) => {
      if (!act.startsWith('go:')) return;
      const pl = PLACE_BY_ID[act.slice(3)];
      sheet.close();
      if (pl) window.setTimeout(() => this.travelSheet(pl), 200);
    });
  }

  private openPlace(place: PlaceDef): void {
    const s = this.state;
    if (this.walkTrip?.placeId === place.id) {
      const toll = afterWalk(s, this.walkTrip.metres);
      this.walkTrip = null;
      if (toll) toast(`Long walk: ${toll.energy} energy, ${toll.fun} fun`, { icon: '🚶', ms: 2500 });
    }
    // On the way to work: no sheet, straight in (the shift starts inside).
    if (this.pendingShift === place.id && place.interior !== 'none') return this.enterInterior(place, true);
    if (!s.stats.placesVisited.includes(place.id)) s.stats.placesVisited.push(place.id);
    const t = nycTime();
    const open = isOpen(place, t.hour);
    const hours = place.hours ? `${fmtH(place.hours[0])}–${fmtH(place.hours[1])}` : 'Open 24/7';
    const isHome = place.id === s.home.placeId;
    const canGoIn = place.interior !== 'none';
    const landmark = place.landmark
      ? `<div class="landmark"><div class="portrait" style="background:${place.color}">${place.emoji}</div><div><p class="blurb" style="margin:0 0 4px">${esc(place.landmark.description)}</p><a href="${place.landmark.officialSite}" target="_blank" rel="noopener noreferrer">Official site: ${esc(place.landmark.siteLabel)} ↗</a></div></div>`
      : '';
    const actions = !canGoIn ? this.actionGrid(place.actions, open) : '';
    const moveWhy = place.type === 'home' && !isHome ? moveBlocker(s, place) : null;
    const rentable = place.type === 'home' && !isHome
      ? `<div class="card"><h3>${place.rent ? `For rent: ${money(place.rent)} / week` : 'Free bed'}</h3><p>${place.rent ? 'Moving here makes it your home. Rent is charged weekly from your cash, then your bank.' : 'No rent. No privacy either. Somewhere to land while you get back up.'} Moving today: <b>${money(moveCost(place, s))}</b> (movers + first week).</p>${moveWhy ? `<p class="sub"><i>${esc(moveWhy)}</i></p>` : ''}<button class="btn primary block" style="margin-top:10px" data-act="move" ${moveWhy ? 'disabled' : ''}>Move in</button></div>`
      : '';
    const cityEvt = eventAt(place.area, place.id, t.dateKey, t.hour, weatherFor(t.dateKey, t.hour));
    const station = place.type === 'station' ? `<div class="stack" style="margin-bottom:12px">${OPEN_AREAS.filter((a) => a !== place.area).map((a) => `<button class="btn primary block" data-act="train:${a}">🚇 Take the train to ${DISTRICTS[a].name} · ${money(SUBWAY_FARE)}</button>`).join('')}</div>` : '';
    const sheet = openSheet({
      emoji: place.emoji,
      title: place.type === 'home' && !isHome ? listingName(s, place) : place.name,
      sub: `${esc(crossStreets(DISTRICTS[place.area], doorOf(place).x, doorOf(place).z))}`,
      body: `
        <div class="row"><span class="tag ${open ? 'open' : 'closed'}">${open ? '● Open' : '● Closed'}</span><span class="tag">${hours}</span>${isHome ? '<span class="tag">🏠 Your home</span>' : ''}</div>
        <p class="blurb">${esc(place.blurb)}</p>
        ${cityEvt ? `<div class="card" style="border:2px solid #fb5607"><h3>${cityEvt.def.emoji} ${esc(cityEvt.def.title)} · now</h3><p>${esc(cityEvt.def.blurb)}</p>${s.joinedEvents.includes(cityEvt.key) ? '<p class="sub" style="margin-top:6px">You were here for this one. ✅</p>' : `<button class="btn primary block" style="margin-top:10px" data-act="cityevt">${esc(cityEvt.def.joinLabel)}</button>`}</div>` : ''}
        ${landmark}${station}${rentable}
        ${place.sells ? `<button class="btn primary block" style="margin-bottom:10px" data-act="shop" ${open ? '' : 'disabled'}>🛍️ Browse clothes</button>` : ''}
        ${canGoIn && (place.type !== 'home' || isHome) ? `<button class="btn primary block" data-act="enter" ${open ? '' : 'disabled'}>${open ? (isHome ? 'Go inside' : 'Go in') : `Closed — opens ${fmtH(place.hours![0])}`}</button>` : ''}
        ${actions}`,
    });
    onAct(sheet.body, (act, el) => {
      if (act === 'cityevt' && cityEvt) {
        const r = joinEvent(s, cityEvt);
        toast(r.text, { icon: cityEvt.def.emoji, tone: r.tone, ms: 4500 });
        if (r.tone === 'good') sfx.notify();
        this.save();
        this.refreshHud(true);
        sheet.close();
        return;
      }
      if (act === 'enter') {
        sheet.close();
        const club = clubOf(place.id);
        if (club) return this.clubDoor(place, club);
        return this.enterInterior(place, true);
      }
      if (act === 'shop') {
        sheet.close();
        const wearing = JSON.stringify(this.state.profile.look);
        return openStore(this.state, place, (look) => this.player.setLook(look), () => {
          if (JSON.stringify(this.state.profile.look) !== wearing) changedClothes(this.state); // bought and put on something new
          this.save();
          this.refreshHud(true);
        });
      }
      if (act === 'move') {
        sheet.close();
        return void this.moveHome(place);
      }
      if (act.startsWith('train:')) {
        sheet.close();
        return void this.rideTrain(act.slice(6) as AreaId, null);
      }
      if (act.startsWith('do:')) {
        sheet.close();
        return void this.runAction(act.slice(3), el);
      }
    });
  }

  private actionGrid(actionIds: string[], open: boolean, extra = ''): string {
    const s = this.state;
    const hour = nycTime().hour;
    const cards = actionIds
      // Life-path activities (crime, CEO, celebrity) only show for players on that path.
      .filter((id) => !ACTIONS[id]?.path || s.paths.active === ACTIONS[id].path!.id)
      .map((id) => {
        const a = ACTIONS[id];
        const lock = !open ? 'Closed now' : actionLock(a, s, hour);
        const fx = Object.entries(a.needs ?? {})
          .filter(([, v]) => v !== 0)
          .slice(0, 3)
          .map(([k, v]) => `<span>${v! > 0 ? '+' : '−'}${k}</span>`)
          .join('');
        const price = a.cost ? `<span class="price">${money(a.cost)}</span>` : a.pay ? '<span class="price free">Earns $</span>' : '<span class="price free">Free</span>';
        return `<button class="action" data-act="do:${id}" aria-disabled="${lock ? 'true' : 'false'}">${price}<span style="font-size:22px">${a.emoji}</span><span class="t">${esc(a.label)}</span><span class="m">${a.seconds}s</span>${lock ? `<span class="lock">🔒 ${esc(lock)}</span>` : `<span class="fx">${fx}</span>`}</button>`;
      })
      .join('');
    return `<div class="actions">${extra}${cards}</div>`;
  }

  /**
   * What visitors come to each place for. Returns true if it handled the
   * action (it opens a screen instead of a timed action).
   */
  private serviceAction(id: string): boolean {
    const s = this.state;
    switch (id) {
      case 'fixPhone': {
        if (!s.phone.ok) {
          const err = buyPrepaidPhone(s);
          toast(err ?? 'The Fix-It Bar set you up with a refurbished phone. Same number, apps back.', { icon: '📱', tone: err ? 'bad' : 'good', ms: 3500 });
        } else {
          const r = changeMoney(s, -2_500, 'Phone tune-up');
          if (!r.ok) toast('A tune-up is $25. Not enough cash.', { icon: '📱', tone: 'bad' });
          else {
            addMoodlet(s, { id: 'phoneTuneUp', label: 'Phone feels brand new', emoji: '📱', value: 3, minutes: 120 });
            toast('New screen protector, battery check, 4,000 photos backed up. $25.', { icon: '📱', tone: 'good', ms: 3500 });
          }
        }
        this.save();
        this.refreshHud(true);
        return true;
      }
      case 'investNow':
        this.openPhoneApp('biz');
        return true;
      case 'tradeStocks':
        this.openPhoneApp('stocks');
        return true;
      case 'bottleService':
        this.openBottleMenu();
        return true;
      case 'chess':
      case 'playChess':
        openChessHouse(this.funHost(), s.location.placeId === 'chessHouse' ? 'The Chess House' : 'Chess in the park');
        return true;
      case 'paintArt':
        openEasel(this.funHost());
        return true;
      case 'viewGallery':
        openGallery(this.funHost());
        return true;
      case 'goFishing':
        goFishing(this.funHost());
        return true;
      case 'fishDerby':
        openDerby(this.funHost());
        return true;
      case 'bikeRace': {
        const why = rentBike(s);
        if (why) {
          toast(why, { icon: '🚴', tone: 'bad' });
          return true;
        }
        this.refreshHud(true);
        raceBike(this.funHost());
        return true;
      }
      case 'mingle': {
        const club = clubOf(this.state.location.placeId);
        if (!club) return true;
        const r = mingle(this.state, club);
        this.earn('clubs', 2, 'mingle');
        if (r.met) {
          sfx.levelUp();
          const c = CONNECTION_BY_ID[r.met.id];
          void this.resultCard(c.emoji, `New connection: ${c.name}`, `${r.text} Perk: ${c.perk}.`);
        } else toast(r.text, { icon: '🍸', ms: 4200 });
        this.save();
        this.refreshHud(true);
        return true;
      }
      case 'getSection':
        this.openSectionSheet();
        return true;
      case 'playSlots':
        openSlots(this.funHost());
        return true;
      case 'playBlackjack':
        openBlackjack(this.funHost());
        return true;
      case 'playRoulette':
        openRoulette(this.funHost());
        return true;
      case 'playRocket':
        openRocket(this.funHost());
        return true;
      case 'casinoCashier':
        toast(`${casinoNetLine(s)} at the casino. Cash only at the tables; the house always has an edge.`, { icon: '💵', ms: 4500 });
        return true;
      case 'playSnake':
      case 'playHoops':
      case 'playPigeons':
      case 'playBeats':
      case 'playStack':
      case 'playDash':
      case 'playClaw':
        playArcade(this.funHost(), id.slice(4).toLowerCase());
        return true;
      case 'prizeCounter':
        openPrizeCounter(this.funHost());
        return true;
      case 'sportsbook':
        openSportsbook(this.funHost());
        return true;
      case 'trainHard':
        openWorkout(s, 'Train hard', () => this.funHost().saved());
        return true;
      case 'dateHere':
        this.openPhoneApp('contacts');
        toast('Pick someone from your contacts and plan a date.', { icon: '💘', ms: 3000 });
        return true;
      case 'reportCrime': {
        const sheet = openSheet({
          emoji: '📝',
          title: 'Report someone',
          sub: '18th Precinct · non-emergency',
          body: `<div class="travel">
            ${!s.phone.ok ? '<button class="opt" data-act="phone"><span style="font-size:24px">📱</span><span class="grow"><b>My phone was stolen</b><small>They might find it</small></span></button>' : ''}
            <button class="opt" data-act="scam"><span style="font-size:24px">🎭</span><span class="grow"><b>Someone scammed me</b><small>File it, warn the neighbourhood</small></span></button>
            <button class="opt" data-act="fight"><span style="font-size:24px">🤕</span><span class="grow"><b>Someone jumped me</b><small>Get it on record</small></span></button>
            <button class="opt" data-act="noise"><span style="font-size:24px">📢</span><span class="grow"><b>Noise complaint</b><small>The neighbours. Again.</small></span></button>
          </div>`,
        });
        onAct(sheet.body, (act) => {
          sheet.close();
          if (act === 'phone') return toast(reportToPolice(s), { icon: '🚓', ms: 4000 });
          s.skills.streetSmarts = Math.min(10, s.skills.streetSmarts + 0.1);
          addMoodlet(s, { id: 'reported', label: 'Got it on record', emoji: '📝', value: 2, minutes: 90 });
          toast(act === 'noise' ? 'Noted. An officer will “swing by.”' : 'Report filed. A detective will look into it.', { icon: '🚓', ms: 3000 });
          this.save();
        });
        return true;
      }
    }
    return false;
  }

  /** What the casino, arcade and sportsbook screens need. */
  private funHost(): CasinoHost & ChessHost & FishHost & BikeHost & ArtHost {
    return {
      state: this.state,
      saved: () => {
        this.save();
        this.refreshHud(true);
      },
      // 🏆 Season points and ✅ daily challenges (sim/season.ts).
      onScore: (_game, score) => (this.credit('arcadeGame'), this.earn('arcade', Math.floor(score / 100) * POINTS.arcadePer100 + 2, 'arcade')),
      onChess: (outcome, opp) => outcome === 'win' && (this.credit('chessWin'), this.earn('chess', POINTS.chessWin * (opp === 'gloria' ? 4 : opp === 'eddie' ? 2 : 1), 'chessWin')),
      onCatch: (lb) => (this.credit('fishLanded'), this.earn('fishing', Math.max(1, Math.round(lb * POINTS.fishPerLb)), 'fish')),
      onRace: (place) => (place === 0 && this.credit('raceWin'), this.earn('racing', place === 0 ? POINTS.raceWin : place < 3 ? POINTS.racePlace : 2, 'race')),
      onArt: () => (this.credit('paintHung'), this.earn('art', 5, 'art')),
      onHang: (title: string, img: string) => this.online?.hangArt(title, img),
      net: this.online?.signedIn ? this.online : undefined,
      onSold: () => this.credit('artSold'),
    };
  }

  /**
   * The playable stuff counts for life paths like actions do (Fighter,
   * Artist, Game Shark: data/paths.ts). No risk roll.
   */
  private credit(actionId: string): void {
    const r = onPathAction(this.state, actionId, 0);
    if (r.rep) window.setTimeout(() => toast(`+${r.rep} rep · ${pathTitle(this.state)}`, { icon: PATHS.get(this.state.paths.active!)?.emoji ?? '⭐', ms: 2000 }), 1800);
    if (this.state.paths.active && !levelBlockers(this.state, this.state.paths.active).length) window.setTimeout(() => toast('You can level up! Phone → Life Path', { icon: '📈', tone: 'good', ms: 3500 }), 3800);
  }

  /** Earn season points and count a daily challenge; show what that did. */
  private earn(what: string, pts: number, challenge?: string, n = 1, placeId?: string): void {
    const s = this.state;
    if (pts > 0) addPoints(s, what, pts);
    const lines = challenge ? progress(s, challenge, n, placeId) : [];
    lines.forEach((l, i) => window.setTimeout(() => toast(l, { icon: '✅', tone: 'good', ms: 4200 }), 600 + i * 1600));
    if (lines.length) sfx.levelUp();
    this.save();
  }

  /** Once a second: the section timer and finished bets. */
  private funTick(): void {
    const s = this.state;
    if (s.section && endSectionIfOver(s)) {
      this.sectionCrew?.set(0);
      toast('Your section’s time is up. The crew heads out. 🥂', { icon: '🛋️', ms: 4000 });
      this.save();
    }
    this.drawSectionChip();
    if (s.fun?.bets.some((b) => !b.settled)) settleAndTell(this.funHost());
    this.socialTick();
    this.hintTick();
    if (this.netChip && this.online) {
      const show = this.online.signedIn && this.engine.mode === 'city';
      this.netChip.hidden = !show;
      if (show) this.netChip.textContent = `🌐 ${this.online.here}`;
    }
    // 🎨 Likes on your paintings, 🎣 the morning derby's result (every ~10 s).
    if (++this.slowTick % 10 === 0) {
      // ✅ A new game day: new challenges.
      if (s.daily && s.daily.day !== nycTime().dateKey) {
        const d = daily(s);
        toast(`✅ New daily challenges: ${d.picks.map((id) => CHALLENGES.find((c) => c.id === id)?.emoji).join(' ')} (Phone → 🏆)`, { icon: '✅', ms: 4500 });
      }
      const season = rollSeason(s);
      if (season) toast(season, { icon: '🏆', tone: 'good', ms: 6000 });
      for (const line of artTick(s)) {
        toast(line, { icon: '🎨', tone: 'good', ms: 4500 });
        if (/likes/.test(line)) {
          addPoints(s, 'art', POINTS.artMilestone);
          this.credit('artMilestone');
        }
      }
      const derby = settleDerby(s);
      if (derby) toast(derby, { icon: '🎣', tone: 'good', ms: 5000 });
      if (derby && /1st/.test(derby)) this.credit('derbyWin');
      if (derby || s.art?.some((a) => a.told)) this.save();
    }
  }
  private slowTick = 0;
  private sessionSeconds = 0;
  private lastHintAt = -Infinity;

  /** 💡 A tip for new players, now and then (sim/hints.ts). */
  private hintTick(): void {
    this.sessionSeconds++;
    if (this.sessionSeconds - this.lastHintAt < HINT_GAP_SECONDS) return;
    if (this.busy || isSheetOpen() || document.querySelector('.modal-wrap, .mg-wrap, .phone, .map, .onboard, .hint-tip')) return;
    const s = this.state;
    const h = nextHint(s, { where: whereFor(s, this.engine.mode), placeId: s.location.placeId, hour: nycTime().hour }, this.sessionSeconds);
    if (!h) return;
    this.lastHintAt = this.sessionSeconds;
    this.save();
    showHint(h, hintLevel(s), (l) => this.setHints(l));
  }

  private setHints(l: HintLevel): void {
    this.state.settings.hints = l;
    this.save();
    this.refreshHud(true);
    toast(l === 'off' ? 'Tips off. Turn them back on in Phone → Settings.' : l === 'few' ? 'Only the important tips from now on.' : 'Tips on.', { icon: '💡', ms: 3000 });
  }

  /**
   * Friends (sim/invites.ts): plans you missed, friends arriving (or
   * flaking), the hangout ending, friends inviting you, and bottle-only
   * guests leaving your section.
   */
  private socialTick(): void {
    const s = this.state;
    const soc = socialOf(s);
    const now = nowMs();
    const first = (id: string) => personOf(id).name.split(' ')[0];
    for (const x of expirePlans(s, now)) toast(x.text, { icon: '💀', tone: 'bad', ms: 6000 });
    const here = this.engine.mode === 'interior' ? s.location.placeId : null;
    // The hangout ends when time's up or you leave.
    if (soc.hangout && (now > soc.hangout.until || here !== soc.hangout.placeId)) {
      const id = soc.hangout.personId;
      const r = endHangout(s, now);
      if (r) toast(`${first(id)} headed out. +${r.bond} 💛 today`, { icon: '🤙', tone: 'good', ms: 4000 });
      this.save();
    }
    // Someone you have plans with, here, now.
    if (!soc.hangout && here) {
      const plan = planHere(s, here, now);
      if (plan && now >= plan.at) {
        const id = otherOf(plan).id;
        const excuse = flakes(id, plan.id);
        if (excuse) {
          plan.status = 'flaked';
          const m = s.people[id];
          if (m) logWith(m, '🫠', 'They flaked', now);
          toast(`${first(id)}: “${excuse}”`, { icon: '🫠', ms: 6000 });
        } else {
          startHangout(s, plan, now);
          sfx.notify();
          toast(`${first(id)} is here 👋 Tap 🤙 to hang out.`, { icon: OUTINGS[plan.outing].emoji, tone: 'good', ms: 4500 });
        }
        this.save();
      }
    }
    // Their avatar, in the room you're in.
    if (soc.hangout && this.interior && (!this.buddy || this.buddy.scene !== this.interior.scene)) {
      this.buddy?.dispose();
      this.buddy = new Buddy(this.interior.scene, this.player.root, soc.hangout.personId);
    } else if (!soc.hangout && this.buddy) {
      this.buddy.dispose();
      this.buddy = null;
    }
    // A friend invites you.
    const inc = maybeIncoming(s, Math.random, now);
    if (inc) {
      sfx.buzz();
      sfx.msgIn();
      toast(`${first(inc.from.id)}: “${inc.reply}” (Link Up to answer)`, { icon: '📲', ms: 6000 });
      this.save();
    }
    // Bottle-only guests drift off when the bottles stop.
    const gone = freeloadersLeave(s, now);
    if (gone.length) {
      this.sectionCrew?.set(s.section?.friends.length ?? 0);
      toast(gone.length === 1 ? `${first(gone[0])} left. The bottle was empty, and so was the friendship.` : `${gone.length} “friends” left the minute the bottles stopped.`, { icon: '🍾', ms: 5000 });
      this.save();
    }
    this.drawHangoutChip();
  }

  /** The 🤙 chip while you're hanging out with someone. */
  private drawHangoutChip(): void {
    const h = socialOf(this.state).hangout;
    if (!h) {
      this.hangoutChip?.remove();
      this.hangoutChip = null;
      return;
    }
    if (!this.hangoutChip) {
      this.hangoutChip = html('<button class="hangout-chip" aria-label="Hang out"></button>');
      this.hangoutChip.addEventListener('click', () => openHangout(this.hangoutHost()));
      root().appendChild(this.hangoutChip);
    }
    const left = Math.max(0, h.until - nowMs());
    this.hangoutChip.textContent = `🤙 ${personOf(h.personId).name.split(' ')[0]} · ${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')} · +${h.bond} 💛`;
    this.hangoutChip.classList.toggle('stacked', !!this.sectionChip);
  }

  private hangoutHost(): HangoutHost {
    const s = this.state;
    return {
      state: s,
      saved: () => {
        this.save();
        this.refreshHud(true);
        this.drawHangoutChip();
      },
      react: (emoji, happy) => this.buddy?.react(emoji, happy),
      run: (label, seconds) =>
        new Promise((resolve) => {
          let stopped = false;
          const bar = progressBar(label, { skipLabel: 'Stop', onSkip: () => (stopped = true), compact: true });
          const t0 = performance.now();
          const tick = () => {
            const f = (performance.now() - t0) / (seconds * 1000);
            if (stopped) return (bar.remove(), resolve(false));
            bar.set(f);
            if (f >= 1) return (bar.remove(), resolve(true));
            requestAnimationFrame(tick);
          };
          tick();
        }),
      hasTv: () => {
        const id = s.location.placeId ?? '';
        const items = s.homes[id] ?? (PLACE_BY_ID[id]?.interior === 'apartment' ? layoutForPlace(id).furniture : []);
        return items.some((it) => FURNITURE.get(it.item)?.tv);
      },
      versus: (name, done) => {
        const id = socialOf(s).hangout?.personId ?? '';
        playArcade(this.funHost(), 'pigeons', { name, skill: tasteFor(id, 'arcade') + 1, done });
      },
    };
  }

  /** The little timer chip while your section is on. */
  private drawSectionChip(): void {
    const sec = this.state.section;
    if (!sec || nowMs() >= sec.until) {
      this.sectionChip?.remove();
      this.sectionChip = null;
      return;
    }
    if (!this.sectionChip) {
      this.sectionChip = html('<button class="section-chip" aria-label="Your VIP section"></button>');
      this.sectionChip.addEventListener('click', () => {
        if (this.state.location.placeId === this.state.section?.placeId && this.engine.mode === 'interior') this.openSectionSheet();
        else toast(`Your section at ${PLACE_BY_ID[this.state.section!.placeId]?.name ?? 'the club'} is waiting.`, { icon: '🛋️' });
      });
      root().appendChild(this.sectionChip);
    }
    const left = Math.max(0, sec.until - nowMs());
    const mm = Math.floor(left / 60_000), ss = Math.floor((left % 60_000) / 1000);
    this.sectionChip.textContent = `🛋️ ${mm}:${String(ss).padStart(2, '0')} · 👥 ${sec.friends.length}/${friendSlots(sec.spent)}`;
    this.sectionChip.classList.toggle('low', left < 60_000);
  }

  /**
   * 🛋️ Your section (sim/section.ts): $300 for 10 minutes, invite
   * friends (2 to start, up to 12 the more you spend), order bottles,
   * buy more time.
   */
  private openSectionSheet(): void {
    const s = this.state;
    const placeId = s.location.placeId ?? '';
    const place = PLACE_BY_ID[placeId];
    const render = (): string => {
      const sec = activeSection(s, placeId);
      if (!sec) {
        return `<p class="blurb">Your own corner of the club: a sofa, a table, a RESERVED sign. ${money(SECTION.price)} for ${SECTION.minutes} minutes. Bring <b>2 friends</b> to start; every ${money(SECTION.perFriend)} you spend here (bottles, more time) makes room for one more, up to <b>12 friends</b> at ${money(10 * SECTION.price)}.</p>
          <button class="btn primary block" data-act="buy">🛋️ Get a section · ${money(SECTION.price)}</button>
          ${s.section && s.section.placeId !== placeId && nowMs() < s.section.until ? `<p class="sub">You already have a section at ${esc(PLACE_BY_ID[s.section.placeId]?.name ?? 'another club')}.</p>` : ''}`;
      }
      const slots = friendSlots(sec.spent);
      const more = nextSeatIn(sec.spent);
      const left = Math.max(0, sec.until - nowMs());
      const people = inviteList(s).slice(0, 14);
      return `<div class="sec-top"><span>⏱️ ${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')} left</span><span>💸 ${money(sec.spent)} spent</span><span>👥 ${sec.friends.length}/${slots}</span></div>
        <div class="sec-seats">${Array.from({ length: SECTION.maxFriends }, (_, i) => `<i class="${i < sec.friends.length ? 'full' : i < slots ? 'open' : ''}"></i>`).join('')}</div>
        <p class="sub">${more ? `Spend ${money(more)} more (bottles or time) for another seat.` : 'Full house: 12 friends, the max.'}</p>
        <div class="row" style="gap:8px;margin:8px 0"><button class="btn primary" data-act="bottles">🍾 Order bottles</button><button class="btn" data-act="extend">⏱️ +${SECTION.extend.minutes} min · ${money(SECTION.extend.price)}</button></div>
        ${sec.friends.length ? `<h3 style="margin:12px 0 6px;font-size:15px">In your section</h3>
        <p class="sub">Money gets people in. Talking is what makes them friends.</p>
        <div class="travel">${sec.friends.map((id) => {
          const g = sec.guests?.[id];
          const tag = g?.revealed && g.freeloader ? '🍾 Here for the bottles' : g?.kind === 'contact' ? '📱 Your friend' : g?.revealed ? '🕺 Cool, actually' : '🕺 Friend of a friend';
          return `<button class="opt" data-act="talk:${id}"><span style="font-size:22px">${g?.revealed && g.freeloader ? '🍾' : '🗣️'}</span><span class="grow"><b>${esc(personOf(id).name)}</b><small>${tag}${g?.talked ? ` · talked ${g.talked}×` : ''}</small></span><span class="cost">Talk</span></button>`;
        }).join('')}</div>` : ''}
        <h3 style="margin:12px 0 6px;font-size:15px">Invite</h3>
        <div class="travel">${people.map((p) => `<button class="opt" data-act="invite:${p.id}" ${sec.friends.length >= slots ? 'disabled aria-disabled="true"' : ''}><span style="font-size:22px">${p.contact ? '📱' : '🕺'}</span><span class="grow"><b>${esc(p.name)}</b><small>${p.contact ? (p.busy ? 'Busy tonight' : 'In your contacts') : 'Friend of a friend'}</small></span><span class="cost">Invite</span></button>`).join('')}</div>`;
    };
    const sheet = openSheet({ emoji: '🛋️', title: 'VIP section', sub: esc(place?.name ?? ''), body: render() });
    const timer = window.setInterval(() => {
      if (!sheet.body.isConnected) return window.clearInterval(timer);
      const top = sheet.body.querySelector('.sec-top span');
      const sec = activeSection(s, placeId);
      if (top && sec) {
        const left = Math.max(0, sec.until - nowMs());
        top.textContent = `⏱️ ${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')} left`;
      }
    }, 1000);
    onAct(sheet.body, (act) => {
      if (act === 'buy') {
        const r = buySection(s, placeId);
        if (!r.ok) return toast(r.why, { icon: '🛋️', tone: 'bad' });
        sfx.cash();
        this.venueLife?.cheer(4);
        rain(sheet.body, '🥂', 14);
        this.onClubSpend(['🛋️ ' + s.profile.name.toUpperCase(), 'just got a VIP section']);
        toast('The section’s yours for 10 minutes. Invite your people.', { icon: '🛋️', tone: 'good', ms: 3500 });
      } else if (act === 'extend') {
        const why = extendSection(s, placeId);
        if (why) return toast(why, { icon: '⏱️', tone: 'bad' });
        sfx.cash();
        toast(`+${SECTION.extend.minutes} minutes. The night’s still young.`, { icon: '⏱️', tone: 'good' });
      } else if (act === 'bottles') {
        sheet.close();
        return this.openBottleMenu();
      } else if (act.startsWith('talk:')) {
        const id = act.slice(5);
        const r = talkToGuest(s, placeId, id);
        if (r) {
          const nm = personOf(id).name.split(' ')[0];
          toast(`${nm}: ${r.line}${r.bond ? ` +${r.bond} 💛` : ''}`, { icon: r.freeloader ? '🍾' : '🗣️', tone: r.freeloader ? 'info' : 'good', ms: 4500 });
          if (r.newContact) window.setTimeout(() => toast(`${nm} put their number in your phone. New friend in Link Up.`, { icon: '📱', tone: 'good', ms: 4000 }), 1200);
        }
      } else if (act.startsWith('invite:')) {
        const id = act.slice(7);
        const why = inviteFriend(s, placeId, id);
        if (why) return toast(why, { icon: '🛋️', tone: 'bad' });
        sfx.notify();
        this.sectionCrew?.set(s.section?.friends.length ?? 0);
        toast('They’re on the way! 🕺', { icon: '📱', tone: 'good' });
      }
      this.save();
      this.refreshHud(true);
      this.drawSectionChip();
      sheet.body.innerHTML = render();
    });
  }

  /** 🍾 The bottle menu: seven bottles, $700 to $100,000. The bigger the bottle, the bigger the show. */
  private openBottleMenu(): void {
    const s = this.state;
    const sheet = openSheet({
      emoji: '🍾',
      title: 'Bottle service',
      sub: `Cash ${money(s.money)} · bank ${money(s.bank)}${bottleDiscount(s) ? ` · ${CAREER_BY_ID[s.job!.careerId].emoji} staff discount ${Math.round(bottleDiscount(s) * 100)}% off` : ''}`,
      body: `<div class="travel">${BOTTLES.map((b, i) => {
        const price = bottlePrice(s, b);
        const can = s.money + s.bank >= price;
        const show = [b.spotlight ? '💡 spotlight' : '', `🎆 ${['big', 'bigger', 'huge', 'huge', 'massive', 'massive', 'the whole sky'][i]} fireworks`, `👥 ${b.admirers} come over`].filter(Boolean).join(' · ');
        return `<button class="opt" data-act="bottle:${b.id}" ${can ? '' : 'disabled aria-disabled="true"'}><span style="font-size:24px">${b.emoji}</span><span class="grow"><b>${esc(b.name)}</b><small>${esc(b.kind)} · ${show}</small></span><span class="cost">${price < b.price ? `<s>${money(b.price)}</s> ` : ''}${money(price)}</span></button>`;
      }).join('')}</div>`,
    });
    onAct(sheet.body, (act) => {
      if (!act.startsWith('bottle:')) return;
      sheet.close();
      const r = buyBottle(s, act.slice(7));
      if (!r.ok) return toast(r.why, { icon: '🍾', tone: 'bad' });
      sfx.cork();
      window.setTimeout(() => sfx.cheer(), 450);
      sfx.cash();
      // Bigger clubs put on a bigger show (data/clubs.ts → show).
      const club = clubOf(s.location.placeId);
      const k = club?.show ?? 1;
      const show = { ...r.bottle, spotlight: Math.round(r.bottle.spotlight * k), admirers: Math.min(9, Math.round(r.bottle.admirers * Math.min(1.5, k))), fireworks: { ...r.bottle.fireworks, size: Math.min(6, r.bottle.fireworks.size * k), seconds: Math.round(r.bottle.fireworks.seconds * Math.min(1.6, k)) } };
      this.startShow(show, `${r.bottle.emoji} ${r.bottle.name} for ${s.profile.name}!`);
      this.onClubSpend([`${r.bottle.emoji} ${s.profile.name.toUpperCase()}`, `just popped ${r.bottle.name}!`]);
      this.earn('bottles', POINTS.bottle * (BOTTLES.indexOf(r.bottle) + 1), 'bottle');
      window.setTimeout(() => toast(`+${r.street} street rep${r.rankUp ? ` · you're now ${r.rankUp}` : ''}`, { icon: '🔥', tone: 'good', ms: 3000 }), 1200);
      s.news.unshift({ id: `bottle-${nowMs()}`, at: nowMs(), scope: s.location.area, emoji: '🍾', headline: `${s.profile.name} popped a ${r.bottle.name} at ${PLACE_BY_ID[s.location.placeId ?? '']?.name ?? 'the club'}`, personal: true });
      this.save();
      this.refreshHud(true);
    });
  }

  /** Money spent at a club: your name on the screen, and the top-spenders board. */
  private onClubSpend(lines: string[]): void {
    const club = clubOf(this.state.location.placeId);
    if (!club || !this.clubScreen) return;
    this.clubScreen.announce(lines, 8);
    this.clubScreen.setBoard(topSpenders(this.state, club));
    // And big across the top of your screen, so you see it at any zoom.
    root().querySelector('.club-marquee')?.remove();
    const m = html(`<div class="club-marquee" style="--c:${club.screen}" role="status"><span>📺</span><b>${esc(lines[0])}</b><small>${esc(lines.slice(1).join(' '))}</small></div>`);
    root().appendChild(m);
    window.setTimeout(() => m.remove(), 5200);
  }

  // ---- Clubs (data/clubs.ts, sim/clubs.ts) ----
  private clubScreen: ClubScreen | null = null;

  /** In a club: the LED wall, and the DJ dropping the beat now and then. */
  private setupClub(place: PlaceDef): void {
    const club = clubOf(place.id);
    if (!club || !this.interior || !('layout' in this.interior)) return;
    const home = this.interior as HomeInterior;
    const screen = new ClubScreen(club, place.name, home.layout.width, home.layout.depth);
    home.scene.add(screen.mesh);
    screen.setBoard(topSpenders(this.state, club));
    this.clubScreen = screen;
    let dropIn = club.dropEvery * (0.35 + Math.random() * 0.3);
    const update = home.update;
    const dispose = home.dispose;
    home.update = (dt) => {
      update(dt);
      screen.update(dt);
      dropIn -= dt;
      if (dropIn <= 0 && this.engine.mode === 'interior') {
        dropIn = club.dropEvery * (0.8 + Math.random() * 0.4);
        this.djDrop(club, screen);
      }
    };
    home.dispose = () => {
      screen.dispose();
      if (this.clubScreen === screen) this.clubScreen = null;
      dispose();
    };
    window.setTimeout(() => toast(`${place.emoji} ${club.label} · 🎧 ${screen.djName} tonight`, { icon: '🎶', ms: 3200 }), 1200);
  }

  /** The DJ drops the beat: the room goes off, you get a lift (more at bigger clubs). */
  private djDrop(club: ClubDef, screen: ClubScreen): void {
    screen.announce(['🔊 DROP!', screen.djName], 5);
    this.venueLife?.cheer(4 + club.tier);
    sfx.boom();
    applyNeeds(this.state, { fun: 2 + club.tier * 2 });
    toast(`🔊 ${screen.djName} drops the beat. The room goes off.`, { icon: '🪩', ms: 2600 });
  }

  /**
   * The door (Peter, 2026-10-15): in on your 🔥 rep or 😎 Cool (or a
   * promoter you know); else the bouncer says no and you can try to slip
   * him something. Pays the cover. Returns true once you're inside.
   */
  private clubDoor(place: PlaceDef, club: ClubDef): void {
    const s = this.state;
    // Staff and anyone heading to a shift walk straight in.
    if (s.job && CAREER_BY_ID[s.job.careerId]?.placeId === place.id) return this.enterInterior(place, true);
    const d = doorCheck(s, club);
    const enter = (line: string) => {
      if (!payCover(s, club)) return void toast(`Cover is ${money(club.cover)}, cash only. You’re short.`, { icon: '🎟️', tone: 'bad' });
      toast(`${line}${club.cover ? ` Cover ${money(club.cover)}.` : ''}`, { icon: '🎟️', ms: 3000 });
      this.enterInterior(place, true);
    };
    if (d.ok) {
      const line = { open: 'Down the stairs you go.', rep: 'The bouncer knows your name. Rope up.', cool: 'He looks at your fit, nods, rope up.', promoter: 'Dre put you on the list. You walk past the line.' }[d.how];
      return enter(line);
    }
    sfx.bad();
    const m = openModal(`<div class="big">🚫</div><h2>The bouncer says no</h2><p>${esc(d.why)}</p><p class="sub">Build 🔥 street rep (bottles, wins, Rideshare Black), get 😎 Cool (cars, clothes), or meet the right people at smaller clubs.</p><div class="choices">${d.bribe ? `<button class="choice" data-act="bribe">💵 <span>Slip him ${money(d.bribe)}<span class="hint">charisma helps · might not work</span></span></button>` : ''}<button class="choice" data-act="leave">🚶 <span>Walk away</span></button></div>`);
    onAct(m.el, (act) => {
      m.close();
      if (act !== 'bribe') return;
      const r = tryBribe(s, club);
      this.refreshHud(true);
      if (!r.ok) {
        sfx.bad();
        return void toast(r.text, { icon: '🚫', tone: 'bad', ms: 4500 });
      }
      enter(r.text);
    });
  }

  /** The show: fireworks, maybe a spotlight, admirers, and the room cheering. */
  private startShow(show: Celebration, line: string): void {
    if (!this.party) return void toast(line, { icon: '🎆', tone: 'good', ms: 3500 });
    this.party.dismissAdmirers();
    this.party.start(show);
    this.venueLife?.cheer(show.fireworks.seconds);
    toast(line, { icon: '🎆', tone: 'good', ms: 4000 });
    sfx.notify();
  }

  /** 📈 A 10×–100× trade: the trading floor goes wild (elsewhere, just the news). */
  private celebrateTrade(mult: number): void {
    const win = tradeWinShow(mult);
    if (!win) return;
    const atFloor = this.state.location.placeId === 'midtownTower' && this.engine.mode === 'interior';
    if (atFloor) {
      closeSheet();
      this.overlayClose?.();
      this.overlayClose = null;
      this.startShow(win.show, `📈 ${Math.floor(mult)}× trade! The floor goes wild.`);
    } else toast(`📈 ${Math.floor(mult)}× trade! (At the trading floor that gets the full show.)`, { icon: '🎆', tone: 'good', ms: 4000 });
    this.state.news.unshift({ id: `trade-${nowMs()}`, at: nowMs(), scope: this.state.location.area, emoji: '📈', headline: `${this.state.profile.name} made ${Math.floor(mult)}× on one trade`, personal: true });
    this.save();
  }

  /** Someone who came over after the show: chat, or go home together (fade to black). */
  private talkToAdmirer(name: string): void {
    const sheet = openSheet({
      emoji: '😍',
      title: name,
      sub: 'Came over to say hi',
      body: `<div class="travel">
        <button class="opt" data-act="chat"><span style="font-size:24px">💬</span><span class="grow"><b>Chat</b><small>+social, +fun</small></span></button>
        <button class="opt" data-act="home"><span style="font-size:24px">🌙</span><span class="grow"><b>Take ${esc(name)} home</b><small>The night ends at your place</small></span></button>
      </div>`,
    });
    onAct(sheet.body, (act) => {
      sheet.close();
      if (act === 'chat') {
        chatAdmirer(this.state);
        toast(`${name}: ${['“So what do you do?”', '“That was a whole moment.”', '“You come here a lot?”', '“Okay, big spender.”'][Math.floor(Math.random() * 4)]}`, { icon: '💬', ms: 2600 });
        this.refreshHud(true);
        return;
      }
      const r = goHomeWith(this.state, name);
      this.party?.dismissAdmirers();
      const home = PLACE_BY_ID[this.state.home.placeId];
      fade(true, 'Heading home…', '');
      window.setTimeout(() => {
        this.state.location = { ...this.state.location, area: home.area, placeId: home.id, x: doorOf(home).x, z: doorOf(home).z };
        this.enterInterior(home, false);
        fade(false);
        // Fade to black: nothing shown.
        void this.showJobScene('🌙', 'Later that night…', `${name} came back to your place. The rest of the night is between you two.`).then(() => {
          if (r.jealous) toast('Word got back to your partner. They’re not happy.', { icon: '😬', tone: 'bad', ms: 4000 });
          this.save();
          this.refreshHud(true);
        });
      }, 700);
    });
  }

  /** Tap a coworker: a quick hello (a little social). */
  private greetCoworker(name: string): void {
    const lines = ['“Busy one today.”', '“You on till close?”', '“Boss is in a mood. Heads up.”', '“Cover me for five?”', '“Ayy, you made it.”'];
    applyNeeds(this.state, { social: 4 });
    toast(`${name}: ${lines[Math.floor(Math.random() * lines.length)]}`, { icon: '👋', ms: 2400 });
    this.refreshHud(true);
  }

  /**
   * A roommate beat (sim/roommate-life.ts): the words and any choice.
   * Returns false when now's a bad time (a menu or minigame is open).
   */
  private roommateBeat(b: Beat): boolean {
    if (this.busy || isSheetOpen() || document.querySelector('.modal-wrap, .mg-wrap')) return false;
    const s = this.state;
    const done = (line: string, icon = '🏠', tone: 'good' | 'bad' | 'info' = 'info') => {
      toast(line, { icon, tone, ms: 4200 });
      this.save();
      this.refreshHud(true);
    };
    const line = beatLine(b);
    switch (b.kind) {
      case 'leave':
        done(line, '🚪');
        break;
      case 'return': {
        done(line, '🚪');
        const paid = maybeRepay(s, b.name);
        if (paid) window.setTimeout(() => done(paid, '🤝', 'good'), 2500);
        break;
      }
      case 'date':
        this.dateLineCache = null;
        done(line, '🚪');
        break;
      case 'leftovers':
        lostLeftovers(s);
        done(line, '🍜', 'bad');
        break;
      case 'borrow':
      case 'party':
      case 'cook': {
        const [yes, no] = b.kind === 'borrow' ? ['🤝 Lend $20', '🙅 Can’t right now'] : b.kind === 'party' ? ['🎉 Join in', '🎧 Headphones on'] : ['😋 Grab a bowl', '🙏 I’m good'];
        const icon = b.kind === 'borrow' ? '💵' : b.kind === 'party' ? '🎉' : '🍲';
        const m = openModal(`<div class="big">${icon}</div><p>${esc(line)}</p><div class="choices"><button class="choice" data-act="yes">${yes}</button><button class="choice" data-act="no">${no}</button></div>`);
        onAct(m.el, (act) => {
          m.close();
          const y = act === 'yes';
          if (b.kind === 'borrow') done(y ? lend(s, b.name) : refuse(s, b.name), '🤝', y ? 'good' : 'info');
          else if (b.kind === 'party') {
            if (y) sfx.cheer();
            done(y ? joinParty(s) : skipParty(s), y ? '🎉' : '🎧', y ? 'good' : 'info');
          } else done(y ? eatShared(s) : `${b.name}: “More for me.”`, '🍲', y ? 'good' : 'info');
        });
        break;
      }
    }
    return true;
  }

  /** Tap a roommate: walk over, they stop and turn to you, then you can chat. */
  private chatWithRoommate(name: string): void {
    const rm = this.roommates?.byName(name);
    if (!rm) return;
    if (this.roommates!.busy(name)) return toast(`${name} is in the middle of something.`, { icon: '🙋', ms: 2200 });
    const p = this.player.root.position;
    const q = rm.avatar.root.position;
    // Stand a step away from them, on your side.
    const d = Math.hypot(p.x - q.x, p.z - q.z) || 1;
    const sx = q.x + ((p.x - q.x) / d) * 0.8, sz = q.z + ((p.z - q.z) / d) * 0.8;
    this.roommates!.hold(name, p.x, p.z, 6);
    const open = () => {
      this.roommates?.hold(name, this.player.root.position.x, this.player.root.position.z, 10);
      const sheet = openSheet({
        emoji: rm.def.body === 'f' ? '🙋‍♀️' : '🙋‍♂️',
        title: rm.def.name,
        sub: `Your roommate · ${esc(rm.def.habit)}`,
        body: this.actionGrid(['chatRoommate'], true, ''),
      });
      onAct(sheet.body, (act, el) => {
        sheet.close();
        if (act.startsWith('do:')) {
          this.roommates?.hold(name, this.player.root.position.x, this.player.root.position.z, 9);
          void this.runAction(act.slice(3), el);
        }
      });
    };
    const target = this.interior && 'spotFree' in this.interior && (this.interior as HomeInterior).spotFree(sx, sz) ? { x: sx, z: sz } : { x: p.x, z: p.z };
    this.walkInside(target.x, target.z, open, q.clone());
  }

  /** The fridge: leftovers, ingredients, a free snack, InstaDash. */
  private openKitchenFridge(uid: string): void {
    const home = this.interior as HomeInterior;
    const item = home.items.find((i) => i.uid === uid);
    const def = item ? FURNITURE.get(item.item) : undefined;
    if (!def) return;
    receiveOrders(this.state);
    openFridge(this.state, def.name, def.emoji, {
      eat: (mealId) => this.useFurniture(uid, eatActionId(mealId)),
      snack: () => this.useFurniture(uid, 'snack'),
      extra: def.actions.filter((a) => a !== 'snack').map((a) => ({ actionId: a, run: () => this.useFurniture(uid, a) })),
      order: () => this.openPhoneApp('instadash'),
    });
  }

  /** The stove: pick a meal (time, ingredients and hunger shown first), then cook it. */
  private openKitchenStove(uid: string): void {
    const home = this.interior as HomeInterior;
    const item = home.items.find((i) => i.uid === uid);
    const def = item ? FURNITURE.get(item.item) : undefined;
    if (!def || !item) return;
    receiveOrders(this.state);
    openStove(this.state, def.name, def.emoji, item.item, def.quality ?? 'basic', {
      cook: (mealId) => this.useFurniture(uid, cookActionId(mealId)),
      order: () => this.openPhoneApp('instadash'),
    });
  }

  /** A meal's done: eat a portion now, or leave them all in the fridge. */
  private offerMeal(mealId: string, uid: string): void {
    const food = mealOfAction(eatActionId(mealId));
    if (!food) return;
    const m = food.meal;
    const n = this.state.kitchen?.leftovers[mealId] ?? 0;
    const sheet = openSheet({
      emoji: m.emoji,
      title: `${m.name} is ready`,
      sub: `${n} portion${n === 1 ? '' : 's'} · +${m.hunger} hunger each`,
      body: `<div class="row"><button class="btn primary" style="flex:1" data-act="eat">🍽️ Eat one now</button><button class="btn" style="flex:1" data-act="keep">🧊 Keep ${n === 1 ? 'it' : 'them'} for later</button></div>`,
    });
    onAct(sheet.body, (act) => {
      sheet.close();
      if (act === 'eat') this.useFurniture(uid, eatActionId(mealId));
      else toast(`${m.emoji} In the fridge for later`, { ms: 1800 });
    });
  }

  private openObjectSheet(label: string, emoji: string, actionIds: string[], movableId?: string): void {
    const place = this.state.location.placeId ? PLACE_BY_ID[this.state.location.placeId] : null;
    const open = place ? isOpen(place, nycTime().hour) : true;
    // Bodegas sell prepaid phones when yours is gone.
    const phoneOffer = place?.interior === 'bodega' && !this.state.phone.ok
      ? `<button class="action" data-act="prepaid"><span class="price">${money(PREPAID_PHONE_PRICE)}</span><span style="font-size:22px">📱</span><span class="t">Buy a prepaid phone</span><span class="m">Get your apps back</span></button>`
      : '';
    const isOffice = place?.type === 'work';
    // Home furniture that opens a screen (the closet).
    const homeItem = movableId && this.interior && 'items' in this.interior ? (this.interior as HomeInterior).items.find((i) => i.uid === movableId) : undefined;
    const homeDef = homeItem ? FURNITURE.get(homeItem.item) : undefined;
    // The fridge and the stove have their own screens (ui/kitchen.ts).
    if (homeItem && homeDef?.opens === 'fridge') return this.openKitchenFridge(homeItem.uid);
    if (homeItem && homeDef?.opens === 'stove') return this.openKitchenStove(homeItem.uid);
    const opensCloset = homeDef?.opens === 'closet';
    // Quality: how much it gives back (cheap pieces can leave a downside).
    const q = homeDef?.quality ?? 'basic';
    const qualityNote = homeDef && actionIds.length ? `<p class="blurb quality-note q-${q}"><b>${FURNITURE_QUALITY[q].label}</b> · ${qualityLine(q)}</p>` : '';
    const canMove = !!homeItem && !homeDef?.fixed;
    // Any workplace (an office, the deli…): work a shift if it's your job,
    // or ask about the job if it isn't yet.
    const careerHere = place ? CAREERS.find((c) => c.placeId === place.id) : undefined;
    const worksHere = !!careerHere && this.state.job?.careerId === careerHere.id;
    const workBtn = worksHere
      ? `<button class="btn primary block" style="margin-bottom:10px" data-act="work">💼 Work a shift <small>(${money(payBand(this.state).auto)}–${money(payBand(this.state).max)})</small></button>`
      : careerHere && !isOffice
        ? `<button class="btn primary block" style="margin-bottom:10px" data-act="hire">💼 Ask about a job: ${esc(careerHere.ladder[0].title)} · ${money(careerBand(careerHere.id).auto)}–${money(careerBand(careerHere.id).max)} a shift</button>`
        : '';
    const sheet = openSheet({
      emoji,
      title: label,
      sub: place ? esc(place.name) : undefined,
      body:
        workBtn +
        qualityNote +
        (actionIds.length || phoneOffer ? this.actionGrid(actionIds, open, phoneOffer) : `<p class="blurb">${isOffice ? 'This is a workplace. Apply for the job on your phone, then come back for shifts.' : movableId ? 'Just for looks — but it makes the place feel like home.' : 'Nothing to do here right now.'}</p>`) +
        (opensCloset ? '<button class="btn primary block" style="margin-top:10px" data-act="closet">👕 Open closet</button>' : '') +
        (canMove ? '<div class="row" style="margin-top:10px"><button class="btn" style="flex:1" data-act="move-furniture">✋ Move</button><button class="btn" style="flex:1" data-act="store-furniture">📦 Put away</button></div>' : movableId && homeDef?.fixed ? '<p class="blurb" style="margin-top:10px">Built in: it stays where it is.</p>' : ''),
    });
    onAct(sheet.body, (act, el) => {
      sheet.close();
      if (act === 'prepaid') {
        const err = buyPrepaidPhone(this.state);
        toast(err ?? 'New prepaid phone, same number. Apps unlocked!', { icon: '📱', tone: err ? 'bad' : 'good' });
        return this.save();
      }
      if (act === 'work') return void this.goToWork();
      if (act === 'hire' && careerHere) {
        const had = this.state.job ? CAREER_BY_ID[this.state.job.careerId].name : null;
        const err = applyForJob(this.state, careerHere.id);
        if (err) return toast(err, { icon: '💼', tone: 'bad' });
        sfx.notify();
        toast(`Hired! You’re a ${careerHere.ladder[0].title} at ${place!.name}${had ? ` (you left ${had})` : ''}. Tap the counter to work a shift.`, { icon: '🎉', tone: 'good', ms: 4500 });
        this.save();
        return this.refreshHud(true);
      }
      if (act === 'move-furniture' && movableId) return this.startMoving(movableId);
      if (act === 'store-furniture' && movableId) return this.storeFurniture(movableId);
      if (act === 'closet') return this.openClosetMirror(movableId);
      if (act.startsWith('do:')) {
        // Services for visitors (fix a phone, invest, trade, report, a date).
        if (this.serviceAction(act.slice(3))) return;
        // At home: use the piece over time (with a pose and a Stop button).
        if (movableId && homeItem) return this.useFurniture(movableId, act.slice(3));
        void this.runAction(act.slice(3), el);
      }
    });
  }

  // ===================================================================
  // Moving furniture (home only)
  // ===================================================================

  /**
   * Pick up a piece. Drag it with your finger (or tap the floor where it
   * should go), turn it, then Done. A green shade on the floor = it fits,
   * red = it doesn't; let go on red and it slides back to where it was.
   */
  private startMoving(uid: string): void {
    const home = this.interior as HomeInterior | null;
    if (!home || !('floors' in home)) return;
    this.stopMoving(false);
    this.stopDoing();
    this.indoor = null;
    const bar = html(`<div class="move-bar"><span>Drag it, or tap the floor</span><button class="btn" data-mv="turn" aria-label="Turn">↻</button><button class="btn" data-mv="cancel" aria-label="Cancel">✕</button><button class="btn primary" data-mv="done">✓ Done</button></div>`);
    root().appendChild(bar);
    bar.querySelector('[data-mv="turn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!home.rotateItem(uid)) toast('Doesn’t fit turned that way. Move it, or turn again', { icon: '🟥', ms: 1800 });
    });
    bar.querySelector('[data-mv="cancel"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopMoving(false);
    });
    bar.querySelector('[data-mv="done"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopMoving(true);
    });
    home.highlight(uid);
    home.beginMove(uid);
    this.moving = { uid, bar };
    this.design?.suspend(true);
  }

  /** Where a screen point lands on the floor (y = 0) through the interior camera. */
  private floorPoint(x: number, y: number): THREE.Vector3 | null {
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.interiorCamera);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  }

  /** Move mode drag: grab the held piece and slide it around the floor. */
  private setupFurnitureDrag(): void {
    const el = this.engine.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || !this.moving || this.engine.mode !== 'interior') return;
      const home = this.interior as HomeInterior;
      const p = this.floorPoint(e.clientX, e.clientY);
      const at = home.itemPos(this.moving.uid);
      if (!p || !at) return;
      // Grab it if you pressed on the piece (or right next to it).
      const g = home.objects.find((o) => o.id === this.moving!.uid)?.mesh;
      const onIt = g && this.engine.pick(e.clientX, e.clientY, [g], this.interiorCamera);
      if (!onIt && Math.hypot(p.x - at.x, p.z - at.z) > 0.9) return;
      this.drag = { id: e.pointerId, dx: at.x - p.x, dz: at.z - p.z, moved: false, sx: e.clientX, sy: e.clientY };
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id || !this.moving) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
      d.moved = true;
      const p = this.floorPoint(e.clientX, e.clientY);
      if (p) (this.interior as HomeInterior).dragTo(this.moving.uid, p.x + d.dx, p.z + d.dz);
    });
    const release = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      // Let the tap handler (which runs first) see the grab, then clear it.
      window.setTimeout(() => (this.drag = null), 0);
      if (!d.moved || !this.moving) return;
      const why = (this.interior as HomeInterior).drop(this.moving.uid);
      if (why) toast(`${why}, so it went back`, { icon: '↩️', ms: 2000 });
      else sfx.tap();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  /** Leave move mode; `keep` saves the new arrangement (otherwise the piece goes back). */
  private stopMoving(keep: boolean): void {
    if (!this.moving) return;
    this.moving.bar.remove();
    this.design?.suspend(false);
    const home = this.interior as HomeInterior | null;
    const uid = this.moving.uid;
    this.moving = null;
    this.drag = null;
    if (!home || !('items' in home)) return;
    home.highlight?.(null);
    home.endMove(uid, !keep);
    // Don't leave yourself standing inside the furniture you just moved.
    const p = this.player.root.position;
    if (!home.spotFree(p.x, p.z)) {
      const obj = home.objects.find((o) => o.id === uid);
      if (obj) p.copy(obj.stand);
    }
    const placeId = this.state.location.placeId;
    if (keep && placeId) {
      this.state.homes[placeId] = home.items.map((i) => ({ ...i }));
      this.save();
      toast('Saved your new layout', { icon: '🛋️', tone: 'good', ms: 1800 });
    }
  }

  /** Move house (sim/moving.ts): pay, then the movers drop you at the new place. */
  private moveHome(place: PlaceDef): string | null {
    const s = this.state;
    const err = moveTo(s, place);
    if (err) {
      toast(err, { icon: '🏠', tone: 'bad', ms: 4000 });
      return err;
    }
    sfx.cheer();
    toast(`Moved in! 📦 ${place.name}. Rent: ${money(place.rent ?? 0)}/week.`, { icon: '🏠', tone: 'good', ms: 4500 });
    this.save();
    closeSheet();
    this.toStreetNow();
    if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
    const d = doorOf(place);
    s.location = { area: place.area, placeId: null, x: d.x, z: d.z };
    this.placePlayerAtLocation();
    this.enterInterior(place, true);
    return null;
  }

  // ===================================================================
  // Interiors
  // ===================================================================

  private enterInterior(place: PlaceDef, animate: boolean): void {
    if (animate) sfx.door();
    const go = () => {
      this.design?.close();
      this.interior?.dispose();
      this.stopMoving(false);
      // A workplace has its own room; other venues share their kind's plan.
      const venue = WORKPLACE_LAYOUTS[WORKPLACE_LAYOUT_FOR[place.id] ?? ''] ?? VENUE_LAYOUTS[VENUE_LAYOUT_FOR[place.interior] ?? ''];
      if (place.interior === 'apartment' && this.furniture) {
        // Sims-style home: its own floor plan, real furniture, saved arrangement.
        const layout = layoutForPlace(place.id);
        this.migrateHome(place.id, layout);
        const home = buildHome(place, layout, this.state.homes[place.id] ?? layout.furniture, this.furniture, { style: this.state.homeStyles?.[place.id], clock: () => nycTime().hourFloat, tier: this.engine.quality.tier });
        this.interior = home;
        // Roommates (the walk-up): they live there too, and wander the shared rooms.
        const mates = layout.conditions?.roommates;
        if (mates?.length) {
          const rm = new Roommates(home, mates, {
            hour: nycTime().hour,
            onBeat: (b) => this.roommateBeat(b),
            onDateLine: (b, i) => {
              const lines = (this.dateLineCache ??= dateLines(b.name));
              if (lines[i]) toast(lines[i], { icon: '🚪', ms: 4200 });
            },
            onDateOver: (b) => {
              this.dateLineCache = null;
              toast(dateOutLine(b), { icon: '🚪', ms: 4200 });
            },
          });
          this.roommates = rm;
          const update = home.update, dispose = home.dispose;
          home.update = (dt) => (update(dt), rm.update(dt));
          home.dispose = () => {
            rm.dispose();
            if (this.roommates === rm) this.roommates = null;
            dispose();
          };
        }
      } else if (venue && this.furniture) {
        // Shops, cafés, bars and offices: same Sims look, the counter sells what the place sells.
        const shop = buildHome(place, venue, venue.furniture, this.furniture, { venue: true, placeActions: place.actions, tier: this.engine.quality.tier });
        this.interior = shop;
        this.myWorkSpot = null;
        // A workplace: 6 worker spots. NPC coworkers fill them; if it's your job, you take one.
        if (venue.workers?.length) {
          const mine = !!this.state.job && CAREER_BY_ID[this.state.job.careerId]?.placeId === place.id;
          // Working here: take a worker spot. Visiting: a visitor spot (up to 30 people a room).
          const room = mine ? assignRoom(this.workRooms, place.id, 'me', this.state.profile.name) : { room: assignVisitor(this.workRooms, place.id, 'me', this.state.profile.name), slot: -1 };
          if (mine && room.slot >= 0) this.myWorkSpot = venue.workers[room.slot] ?? null;
          const crew = new Coworkers(shop.scene, venue, room.room, (x, z) => shop.spotFree(x, z));
          this.coworkers = crew;
          // Lively: NPC visitors (fewer on cheap phones), emoji pops, room effects.
          const tierShare = { low: 0.4, medium: 0.7, high: 1 }[this.engine.quality.tier] ?? 0.7;
          const life = venue.life ? new VenueLife(shop, venue, npcVisitors(room.room, Math.round(venue.life.visitors * tierShare)), crew) : null;
          this.venueLife = life;
          // Bottle service and big trades: fireworks, a spotlight, admirers.
          const party = new CelebrationFx(shop, this.player.root);
          this.party = party;
          // 🛋️ A club with a section: your friends gather round it.
          const sofa = venue.furniture.find((f) => f.item === 'sectionSofa') ?? venue.furniture.find((f) => f.item === 'vipBooth');
          const squad = sofa ? new SectionCrew(shop, sofa, { halfW: venue.width / 2, halfD: venue.depth / 2 }) : null;
          this.sectionCrew = squad;
          squad?.set(activeSection(this.state, place.id)?.friends.length ?? 0);
          const update = shop.update, dispose = shop.dispose;
          shop.update = (dt) => (update(dt), crew.update(dt), life?.update(dt), party.update(dt), squad?.update(dt));
          shop.dispose = () => {
            squad?.dispose();
            if (this.sectionCrew === squad) this.sectionCrew = null;
            crew.dispose();
            life?.dispose();
            party.dispose();
            if (this.party === party) this.party = null;
            if (this.coworkers === crew) this.coworkers = null;
            if (this.venueLife === life) this.venueLife = null;
            for (const r of this.workRooms) r.visitors = r.visitors.filter((v) => v.id !== 'me');
            dispose();
          };
        }
      } else this.interior = buildInterior(place, place.actions);
      this.indoor = null;
      this.interior.scene.add(this.player.root);
      this.player.root.position.copy(this.interior.spawn);
      this.player.root.rotation.set(0, Math.PI, 0);
      this.fitInteriorCamera();
      this.engine.altScene = this.interior.scene;
      this.engine.altCamera = this.interiorCamera;
      this.setMode('interior');
      this.state.location.placeId = place.id;
      this.state.location.area = place.area;
      const door = doorOf(place);
      this.state.location.x = door.x;
      this.state.location.z = door.z;
      const firstVisit = !this.state.stats.placesVisited.includes(place.id);
      if (firstVisit) this.state.stats.placesVisited.push(place.id);
      if (place.id !== this.state.home.placeId) this.earn('explore', firstVisit ? POINTS.newPlace : 0, 'places', 1, place.id);
      if (place.interior !== 'none') this.state.recentPlaces = [place.id, ...(this.state.recentPlaces ?? []).filter((x) => x !== place.id)].slice(0, 6);
      bus.emit('place:entered', { placeId: place.id });
      this.setupClub(place);
      this.refreshHud(true);
      this.resumeActivity(place.id);
      // Arrived at work: the shift starts.
      if (this.pendingShift) {
        const startShift = this.pendingShift === place.id;
        this.pendingShift = null;
        if (startShift) window.setTimeout(() => void this.runShiftHere(), 900);
      }
      const clean = arriveHome(this.state, place.id);
      if (clean) window.setTimeout(() => toast(clean.label, { icon: clean.emoji, tone: 'good', ms: 3000 }), 700);
    };
    if (!animate) return go();
    fade(true);
    window.setTimeout(() => {
      go();
      fade(false);
      if (place.interior === 'furniture') toast('Tap any piece to see it in the catalog', { icon: place.emoji });
      else if (place.interior !== 'apartment') toast(`Tap the ${place.interior === 'office' ? 'desk' : 'counter'} to see what’s on offer`, { icon: place.emoji });
    }, 300);
  }

  /**
   * Frame the whole room on any screen shape. A tall phone sees less
   * width, so the camera backs off (and widens its lens) until the room
   * fits side to side, looking down at a Sims-like angle.
   */
  private fitInteriorCamera(keep = false): void {
    const cam = this.interiorCamera;
    const el = this.engine.renderer.domElement;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    cam.fov = aspect < 0.8 ? 62 : 48;
    cam.aspect = aspect;
    const layout0 = this.interior && 'layout' in this.interior ? (this.interior as HomeInterior).layout : null;
    // A long home on a phone held upright: swing the view a quarter turn so its long side runs up the screen.
    const swing = layout0 && aspect < 0.8 && layout0.width > layout0.depth * 1.15 ? -Math.PI / 2 : 0;
    const roomHalfWidth = swing && layout0 ? layout0.depth / 2 + 1.1 : this.interior?.halfWidth ?? 7.2;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * aspect);
    const dist = Math.max(9, roomHalfWidth / Math.tan(hFov / 2)); // small homes fill the screen too
    cam.far = dist * 4;
    cam.updateProjectionMatrix();
    // Pinch to zoom and drag to pan, in every room, on top of the whole-room framing.
    const layout = this.interior && 'layout' in this.interior ? (this.interior as HomeInterior).layout : null;
    this.view.frame(new THREE.Vector3(0, 0.6, -0.5), new THREE.Vector3(0, dist * 0.72, dist * 0.7), (layout?.width ?? 12) / 2, (layout?.depth ?? 10) / 2, true, keep, swing, layout && layout.width * layout.depth > 180 ? 1.05 : undefined); // every room can zoom (Peter, 2026-10-14)
  }

  /**
   * Pinch to zoom and drag to pan inside the big homes (two fingers, or
   * one finger once zoomed in; the mouse wheel on a computer). A drag on
   * a piece you're moving moves the piece instead. Gestures never walk or
   * pick anything: the engine drops any press that moved.
   */
  private setupInteriorGestures(): void {
    const el = this.engine.renderer.domElement;
    const pts = new Map<number, { x: number; y: number }>();
    const ndc = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return [((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1] as const;
    };
    const active = () => this.engine.mode === 'interior' && this.view.enabled && this.engine.altCamera === this.interiorCamera;
    el.addEventListener('pointerdown', (e) => {
      if (active()) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev || !active()) return;
      // A mouse with no button held isn't dragging (the release happened off the canvas):
      // without this the room followed the mouse around (Peter, 2026-10-14).
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        pts.delete(e.pointerId);
        this.gestureStart.delete(e.pointerId);
        return;
      }
      if (pts.size >= 2) {
        // Pinch: zoom by how much the fingers spread, around their midpoint.
        const others = [...pts.entries()].filter(([id]) => id !== e.pointerId);
        const o = others[0][1];
        const before = Math.hypot(prev.x - o.x, prev.y - o.y);
        const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        const [mx, my] = ndc((e.clientX + o.x) / 2, (e.clientY + o.y) / 2);
        if (before > 10) this.view.zoomAt(after / before, mx, my);
        // ...and pan by half the finger's move (the midpoint moves half as far).
        const [ax, ay] = ndc((prev.x + o.x) / 2, (prev.y + o.y) / 2);
        this.view.dragBy(ax, ay, mx, my);
      } else if (!this.drag && Math.hypot(e.clientX - this.downAt(e.pointerId, prev).x, e.clientY - this.downAt(e.pointerId, prev).y) > 8) {
        const [ax, ay] = ndc(prev.x, prev.y);
        const [bx, by] = ndc(e.clientX, e.clientY);
        this.view.dragBy(ax, ay, bx, by);
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      this.gestureStart.delete(e.pointerId);
    };
    // Releases anywhere count (over a button, outside the window).
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => pts.clear());
    el.addEventListener('wheel', (e) => {
      if (!active()) return;
      e.preventDefault();
      const [x, y] = ndc(e.clientX, e.clientY);
      this.view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, x, y);
    }, { passive: false });
    // iOS Safari: don't let a pinch zoom the whole page.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /** Where a finger first went down (so a tiny wobble doesn't pan). */
  private gestureStart = new Map<number, { x: number; y: number }>();
  private downAt(id: number, now: { x: number; y: number }): { x: number; y: number } {
    if (!this.gestureStart.has(id)) this.gestureStart.set(id, { ...now });
    return this.gestureStart.get(id)!;
  }

  /**
   * The closet, with a mirror: the camera swings round in front of you
   * (framed in the top half of the screen, above the closet sheet) and
   * you turn to face it, so every change shows up close.
   */
  private openClosetMirror(rackUid?: string): void {
    this.stopDoing();
    const inside = this.engine.mode === 'interior' && !!this.interior;
    const cam = this.mirrorCamera;
    const prevYaw = this.player.root.rotation.y;
    let yaw = 0; // facing +z, towards the mirror
    const frame = () => {
      const el = this.engine.renderer.domElement;
      const w = Math.max(1, el.clientWidth), hgt = Math.max(1, el.clientHeight);
      cam.aspect = w / hgt;
      cam.fov = 30;
      this.player.root.rotation.y = yaw;
      // Measure the character as it stands (homes may scale it).
      const box = new THREE.Box3().setFromObject(this.player.root);
      const size = box.getSize(new THREE.Vector3());
      const mid = box.getCenter(new THREE.Vector3());
      // The sheet covers the bottom ~54%: fit the character into the top part.
      const share = 0.4; // of the screen's height
      const tall = size.y / share;
      const d = tall / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      cam.position.set(mid.x, mid.y + size.y * 0.12, mid.z + d);
      cam.lookAt(mid.x, mid.y, mid.z);
      // Shift the picture up so the character sits centred in the top 46%.
      cam.setViewOffset(w, hgt, 0, hgt * 0.27, w, hgt);
      cam.near = Math.max(0.05, d * 0.2);
      cam.far = d * 6;
      cam.updateProjectionMatrix();
    };
    if (inside) {
      this.path = [];
      this.player.setAction(null);
      frame();
      this.engine.altCamera = cam;
      document.body.classList.add('mirror');
    }
    openCloset(this.state, {
      apply: (look) => {
        this.player.setLook(look);
        changedClothes(this.state); // a fresh outfit: no more stain
        this.save();
      },
      turn: inside ? () => { yaw += Math.PI / 2; frame(); } : undefined,
      move: rackUid ? () => window.setTimeout(() => this.startMoving(rackUid), 350) : undefined,
      onClose: () => {
        document.body.classList.remove('mirror');
        if (!inside || this.engine.altCamera !== cam) return;
        this.engine.altCamera = this.interiorCamera;
        this.player.root.rotation.y = prevYaw;
      },
    });
  }

  private leaveInterior(): void {
    if (!this.interior) return;
    sfx.door();
    this.design?.close();
    this.stopDoing();
    this.indoor = null;
    this.stopMoving(true);
    const placeId = this.state.location.placeId;
    fade(true);
    window.setTimeout(() => {
      this.interior?.dispose();
      this.interior = null;
      this.engine.cityScene.add(this.player.root);
      this.setMode('city');
      this.engine.altScene = null;
      this.state.location.placeId = null;
      this.placePlayerAtLocation();
      // Face out of the door.
      if (placeId) {
        const d = doorOf(PLACE_BY_ID[placeId]);
        this.player.root.rotation.y = Math.atan2(d.faceX, d.faceZ);
      }
      fade(false);
      this.refreshHud(true);
    }, 300);
  }

  // ===================================================================
  // Doing things
  // ===================================================================

  /** The furniture catalog. Buying delivers to Storage at home. */
  private openShop(focus?: string): void {
    openFurnitureShop(this.state, {
      buy: (item) => {
        const r = buyFurniture(this.state, item);
        if (!r.ok) return r.why;
        sfx.cash();
        this.save(); // money and the delivery are saved together
        this.refreshHud(true);
        const where = hasDoorman(this.state) ? 'the doorman signed for it. It’s in your Storage at home' : 'it’s waiting in your Storage at home';
        toast(`${r.def.emoji} ${r.def.name} bought: ${where}`, { icon: '📦', tone: 'good', ms: 3500 });
        return null;
      },
    }, focus);
  }

  // ===================================================================
  // Furniture storage: pieces you own that aren't placed
  // ===================================================================

  /** Put a piece away: it leaves the room and waits in Storage. */
  private storeFurniture(uid: string): void {
    const home = this.interior as HomeInterior | null;
    if (!home || !('removePiece' in home)) return;
    const it = home.items.find((i) => i.uid === uid);
    const def = it && FURNITURE.get(it.item);
    if (!it || !def || def.fixed) return;
    this.stopDoing();
    home.removePiece(uid);
    (this.state.storage ??= []).push(it.item);
    this.saveHomeLayout();
    toast(`${def.emoji} ${def.name} put away. It's in Storage`, { icon: '📦', ms: 2200 });
  }

  /** Remember this home's furniture as it is now. */
  private saveHomeLayout(): void {
    const home = this.interior as HomeInterior | null;
    const placeId = this.state.location.placeId;
    if (home && 'items' in home && placeId) {
      this.state.homes[placeId] = home.items.map((i) => ({ ...i }));
      if (home.movable) (this.state.homeStyles ??= {})[placeId] = structuredClone(home.style);
    }
    this.save();
  }

  /**
   * Swap a stored piece for one that's out (the new bed for the old one):
   * the new one goes where the old one stood (or as near as it fits), the
   * old one goes into Storage.
   */
  private swapFurniture(item: string, oldUid: string): void {
    const home = this.interior as HomeInterior | null;
    if (!home || !('addPiece' in home)) return;
    const old = home.items.find((i) => i.uid === oldUid);
    const stored = this.state.storage ?? [];
    const k = stored.indexOf(item);
    if (!old || k < 0) return;
    this.stopDoing();
    const spot = { item: old.item, x: old.x, z: old.z, rot: old.rot };
    home.removePiece(oldUid);
    const uid = home.addPiece(item, spot.x, spot.z, spot.rot);
    if (!uid) {
      // No room even there: put the old one back as it was.
      home.addPiece(spot.item, spot.x, spot.z, spot.rot);
      return toast('That doesn’t fit there. Make some room first', { icon: '📦', tone: 'bad' });
    }
    stored.splice(k, 1);
    stored.push(spot.item);
    this.saveHomeLayout();
    const d = FURNITURE.get(item)!;
    toast(`${d.emoji} ${d.name} is in. The ${FURNITURE.get(spot.item)!.name.toLowerCase()} went to Storage`, { icon: '✨', tone: 'good', ms: 3200 });
  }

  /**
   * The home design menu (ui/design-mode.ts): buy and place furniture,
   * paint walls, lay floors, lights, whole-home styles, storage.
   */
  private openDesign(): void {
    const home = this.interior as HomeInterior | null;
    if (!home || !('setStyle' in home) || !home.movable || this.design) return;
    this.stopDoing();
    this.indoor = null;
    this.hud.setVisible(false);
    // The menu covers the bottom of the screen: lift the room into the space above it.
    const cv = this.engine.renderer.domElement;
    this.view.setLift(Math.min(cv.clientHeight * 0.46, 360) * 0.42, cv.clientWidth, cv.clientHeight);
    const ndc = (x: number, y: number) => {
      const r = this.engine.renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    };
    this.design = new DesignMode({
      home: () => (this.interior && 'setStyle' in this.interior ? (this.interior as HomeInterior) : null),
      cash: () => this.state.money,
      pay: (cents, what) => {
        if (cents <= 0) return true;
        if (this.state.money < cents) {
          toast(`You need ${money(cents - this.state.money)} more for ${what}`, { icon: '💸', tone: 'bad', ms: 2600 });
          return false;
        }
        this.state.money -= cents;
        this.refreshHud(true);
        return true;
      },
      save: () => this.saveHomeLayout(),
      buyAndPlace: (item) => {
        const def = FURNITURE.get(item);
        const h = this.interior as HomeInterior;
        if (!def) return;
        if (this.state.money < def.price) return toast(`You need ${money(def.price - this.state.money)} more`, { icon: '💸', tone: 'bad', ms: 2400 });
        // Bring it in where you're looking (the middle of the screen).
        const r = this.engine.renderer.domElement.getBoundingClientRect();
        const at = this.floorPoint(r.left + r.width / 2, r.top + r.height * 0.4) ?? this.player.root.position.clone();
        const uid = h.addPiece(item, at.x, at.z);
        if (!uid) return toast('No room for that. Move or put something away first', { icon: '📦', tone: 'bad', ms: 2600 });
        this.state.money -= def.price;
        sfx.cash();
        this.refreshHud(true);
        this.saveHomeLayout();
        this.startMoving(uid);
      },
      move: (uid) => this.startMoving(uid),
      store: (uid) => this.storeFurniture(uid),
      placeStored: (item) => {
        const h = this.interior as HomeInterior;
        const stored = this.state.storage ?? [];
        const r = this.engine.renderer.domElement.getBoundingClientRect();
        const at = this.floorPoint(r.left + r.width / 2, r.top + r.height * 0.4) ?? this.player.root.position.clone();
        const uid = h.addPiece(item, at.x, at.z);
        if (!uid) return toast('No room for that right now. Put something away first', { icon: '📦', tone: 'bad' });
        const k = stored.indexOf(item);
        if (k >= 0) stored.splice(k, 1);
        this.saveHomeLayout();
        this.startMoving(uid);
      },
      storage: () => [...(this.state.storage ?? [])],
      view: this.view,
      ray: (x, y) => {
        const rc = new THREE.Raycaster();
        rc.setFromCamera(ndc(x, y), this.interiorCamera);
        return rc.ray.clone();
      },
      pieceAt: (x, y) => {
        const h = this.interior as HomeInterior;
        const hit = this.engine.pick(x, y, h.objects.map((o) => o.mesh), this.interiorCamera);
        return (hit?.object.userData.objectId as string | undefined) ?? null;
      },
      playerRoom: () => {
        const h = this.interior as HomeInterior;
        const p = this.player.root.position;
        for (let i = h.layout.rooms.length - 1; i >= 0; i--) {
          const [x0, z0, x1, z1] = h.layout.rooms[i].rect;
          if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) return i;
        }
        return 0;
      },
      onClose: () => {
        this.design = null;
        this.view.setLift(0, 1, 1);
        this.stopMoving(true);
        this.hud.setVisible(true);
        this.refreshHud(true);
      },
    });
  }

  /**
   * A home's floor plan got bigger (data/homes.ts `version`): the old
   * arrangement can't fit the new walls, so the new plan's furniture goes
   * in and anything you bought on top waits in Storage.
   */
  private migrateHome(placeId: string, layout: HomeLayout): void {
    const s = this.state;
    const v = layout.version ?? 1;
    const vers = (s.homeVersions ??= {});
    const saved = s.homes[placeId];
    if (saved && (vers[placeId] ?? 1) < v) {
      const left = new Map<string, number>();
      for (const f of layout.furniture) left.set(f.item, (left.get(f.item) ?? 0) + 1);
      for (const it of saved) {
        const n = left.get(it.item) ?? 0;
        if (n > 0) left.set(it.item, n - 1);
        else if (!FURNITURE.get(it.item)?.fixed) (s.storage ??= []).push(it.item);
      }
      delete s.homes[placeId];
      if (s.homeStyles) delete s.homeStyles[placeId];
      window.setTimeout(() => toast('Your place got bigger! Anything extra you owned is in 🎨 Design → Storage', { icon: '🏠', tone: 'good', ms: 4500 }), 900);
    }
    vers[placeId] = v;
  }

  /** Storage: everything you own that isn't out. Tap Place to bring it in. */
  private openStorage(): void {
    const home = this.interior as HomeInterior | null;
    if (!home || !('addPiece' in home)) return;
    this.stopMoving(true);
    const stored = this.state.storage ?? [];
    const counts = new Map<string, number>();
    for (const id of stored) counts.set(id, (counts.get(id) ?? 0) + 1);
    const rows = [...counts].map(([id, n]) => {
      const d = FURNITURE.get(id);
      if (!d) return '';
      const q = FURNITURE_QUALITY[d.quality ?? 'basic'].label;
      // Same kind already out (a bed for a bed): offer a one-tap swap.
      const old = d.kind ? home.items.find((i) => FURNITURE.get(i.item)?.kind === d.kind && !FURNITURE.get(i.item)?.fixed) : undefined;
      const oldDef = old ? FURNITURE.get(old.item)! : null;
      return `<div class="list-item storage-row"><span style="font-size:26px" aria-hidden="true">${d.emoji}</span><span class="grow"><div class="title">${esc(d.name)}${n > 1 ? ` ×${n}` : ''}</div><div class="sub">${q} · ${d.actions.length ? 'usable' : 'decoration'}</div></span><div class="storage-acts">${
        oldDef ? `<button class="btn primary" data-act="swap:${id}:${old!.uid}">Swap for the ${esc(oldDef.name.toLowerCase())}</button>` : ''
      }<button class="btn" data-act="place:${id}">Place</button></div></div>`;
    }).join('');
    const sheet = openSheet({
      emoji: '📦',
      title: 'Storage',
      sub: 'Furniture you own that isn’t out',
      body: rows ? `<div>${rows}</div>` : '<p class="blurb">Nothing in storage. Tap a piece of furniture and choose “Put away” to store it here.</p>',
    });
    onAct(sheet.body, (act) => {
      if (act.startsWith('swap:')) {
        sheet.close();
        const [, item, oldUid] = act.split(':');
        return this.swapFurniture(item, oldUid);
      }
      if (!act.startsWith('place:')) return;
      sheet.close();
      const item = act.slice(6);
      const p = this.player.root.position;
      const uid = home.addPiece(item, p.x, p.z + 0.8);
      if (!uid) return toast('No room for that right now. Put something away first', { icon: '📦', tone: 'bad' });
      const k = stored.indexOf(item);
      if (k >= 0) stored.splice(k, 1);
      this.saveHomeLayout();
      // Straight into move mode, so you can put it exactly where you want.
      this.startMoving(uid);
    });
  }

  // ===================================================================
  // Using furniture at home (sim/home-activity.ts)
  // ===================================================================

  /**
   * Use a piece: start the activity (charges any cost), pose on it (lie on
   * the bed, sit on the couch or toilet, sit at the desk, step into the
   * shower), and fill the needs in over time. Stop any time.
   * TV actions sit you on the nearest couch or chair first.
   */
  private useFurniture(uid: string, actionId: string, step: 'new' | 'atSeat' | 'resume' = 'new'): void {
    const home = this.interior as HomeInterior | null;
    if (!home || !('pieceInfo' in home)) return;
    const resume = step === 'resume';
    if (!resume) this.stopDoing();
    const a = ACTIONS[actionId];
    // TV: sit on the nearest couch or chair to watch (walk there first).
    const seat = a?.tags.includes('tv') ? this.nearestSeat(home, uid) : null;
    if (seat && step === 'new') {
      const obj = home.objects.find((o) => o.id === seat)!;
      const tv = home.objects.find((o) => o.id === uid)!;
      return this.walkInside(obj.stand.x, obj.stand.z, () => this.useFurniture(uid, actionId, 'atSeat'), tv.mesh.position.clone());
    }
    const target = seat ?? uid;
    const info = home.pieceInfo(uid);
    if (!info) return;
    if (!resume) {
      const r = beginActivity(this.state, actionId, { uid, item: info.item, placeId: this.state.location.placeId });
      if (!r.ok) return toast(r.why, { icon: '🔒', tone: 'bad' });
      if (r.waitedFor) toast(`${r.waitedFor} was in the bathroom. You waited a minute.`, { icon: '🚪', ms: 2800 });
    }
    const act = this.state.activity!;
    if (act.actionId === 'watchTv') this.interior?.playTvAd?.();
    const stand = this.player.root.position.clone();
    this.posePlayer(home, target, actionId);
    const action = ACTIONS[act.actionId];
    const bar = progressBar(`${action.emoji} ${action.label}…`, { skipLabel: 'Stop', onSkip: () => this.stopDoing(true), compact: true });
    bar.set(activityProgress(act));
    this.doing = { bar, uid: target, standX: stand.x, standZ: stand.z };
    this.save();
  }

  /**
   * Back home after a reload: carry on with what you were doing (posed on
   * the piece, bar where it was), or wrap it up if the time already ran out.
   */
  private resumeActivity(placeId: string): void {
    const act = this.state.activity;
    if (!act) return;
    const home = this.interior as HomeInterior | null;
    const here = act.placeId === placeId && !!act.uid && !!home && 'pieceInfo' in home && !!home.pieceInfo(act.uid);
    if (!here) {
      stopActivity(this.state);
      return;
    }
    if (activityProgress(act) >= 1) {
      const res = completeActivity(this.state);
      if (res) toast(`${res.action.emoji} ${res.action.label} — finished while you were away`, { tone: 'good', ms: 3000 });
      if (res?.quirk) toast(res.quirk.label, { icon: res.quirk.emoji, tone: res.quirk.value < 0 ? 'bad' : 'good', ms: 3500 });
      this.save();
      return;
    }
    const obj = home!.objects.find((o) => o.id === act.uid);
    if (obj) this.player.root.position.copy(obj.stand);
    this.useFurniture(act.uid!, act.actionId, 'resume');
  }

  /** The nearest seat (couch, armchair) to a piece, by uid. */
  private nearestSeat(home: HomeInterior, uid: string): string | null {
    const me = home.items.find((i) => i.uid === uid);
    if (!me) return null;
    let best: string | null = null, bd = 5;
    for (const it of home.items) {
      if (!FURNITURE.get(it.item)?.seat) continue;
      const d = Math.hypot(it.x - me.x, it.z - me.z);
      if (d < bd) { bd = d; best = it.uid; }
    }
    return best;
  }

  /** Put the character on/in/at a piece for an activity. */
  private posePlayer(home: HomeInterior, uid: string, actionId: string): void {
    const info = home.pieceInfo(uid);
    const obj = home.objects.find((o) => o.id === uid);
    if (!info || !obj) return;
    const def = FURNITURE.get(info.item)!;
    const use = def.use ?? 'stand';
    const root = this.player.root;
    const up = new THREE.Vector3(0, 1, 0);
    const local = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(up, info.rot).add(new THREE.Vector3(info.x, 0, info.z));
    // The surface height under a spot (the mattress, the seat, the tub floor).
    const surface = (p: THREE.Vector3) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(p.x, 3, p.z), new THREE.Vector3(0, -1, 0));
      obj.mesh.updateMatrixWorld(true);
      const hit = ray.intersectObject(obj.mesh, true)[0];
      return hit ? hit.point.y : 0;
    };
    const fp = info.fp;
    const cz = (fp.minZ + fp.maxZ) / 2, depth = fp.maxZ - fp.minZ;
    root.rotation.set(0, 0, 0, 'XYZ');
    if (use === 'lie') {
      // On your back, head on the pillow (the back of the bed), feet towards the foot.
      const p = local(0, cz + depth * 0.22);
      root.position.set(p.x, surface(local(0, cz)) + 0.08, p.z);
      root.rotation.set(-Math.PI / 2, info.rot, 0, 'YXZ');
      this.player.setAction('idle');
    } else if (use === 'sitOn' || use === 'sitAt') {
      // Couches and toilets: sit facing out. Desks: sit on the chair, facing the desk.
      const p = use === 'sitAt' ? local(0, fp.maxZ - 0.22) : local(0, cz + depth * 0.12);
      root.position.set(p.x, Math.max(0, surface(p) - SEAT_DROP), p.z);
      root.rotation.y = use === 'sitAt' ? info.rot + Math.PI : info.rot;
      this.player.setAction('sit');
      this.player.setHold(1);
    } else if (use === 'stepIn') {
      const p = local(0, cz);
      root.position.set(p.x, surface(p), p.z);
      root.rotation.y = info.rot;
      this.player.setAction('idle');
    } else {
      // Stand at it, facing it: cooking and grabbing food reach in.
      root.position.copy(obj.stand);
      root.rotation.y = Math.atan2(info.x - obj.stand.x, info.z - obj.stand.z);
      const a = ACTIONS[actionId];
      if (a?.tags.includes('eat') || a?.tags.includes('cook')) {
        // Reaching in: hold the pick-up clip at its lowest point.
        this.player.setAction('pickup');
        this.player.setHold(0.45);
      } else this.player.setAction('idle');
    }
  }

  /** Every frame at home: fill the needs in, move the bar, finish when done. */
  private tickDoing(): void {
    if (!this.doing || !this.state.activity) return;
    const f = tickActivity(this.state);
    this.doing.bar.set(f);
    if (f >= 1) this.finishDoing();
  }

  private finishDoing(): void {
    const d = this.doing;
    if (!d) return;
    this.doing = null;
    d.bar.remove();
    const res = completeActivity(this.state);
    this.unpose(d);
    if (!res) return;
    const a = res.action;
    const recovered = recordVariety(this.state, a.id);
    if (recovered) toast(recovered, { icon: '🌤️', tone: 'good', ms: 4500 });
    const bits = [`${a.emoji} ${a.label} — done`];
    if (res.earned > 0) bits.push(`+${money(res.earned)}`);
    toast(bits.join(' · '), { tone: 'good' });
    sfx.done();
    if (res.quirk) toast(res.quirk.label, { icon: res.quirk.emoji, tone: res.quirk.value < 0 ? 'bad' : 'good', ms: 3500 });
    if (res.skillUp) {
      toast(`Skill up! ${res.skillUp.replace(/^\w/, (c) => c.toUpperCase())}`, { icon: '⭐', tone: 'good' });
      sfx.levelUp();
    }
    this.save();
    this.refreshHud(true);
    const food = mealOfAction(a.id);
    if (food?.kind === 'cook' && d.uid) this.offerMeal(food.meal.id, d.uid);
  }

  /** Stop using a piece early: keep what you got so far. */
  private stopDoing(announce = false): void {
    const d = this.doing;
    if (!d) {
      // An activity left over (e.g. from another room): just end it.
      if (this.state.activity) stopActivity(this.state);
      return;
    }
    this.doing = null;
    d.bar.remove();
    const pct = Math.round((this.state.activity ? tickActivity(this.state) : 0) * 100);
    const a = stopActivity(this.state);
    this.unpose(d);
    const cooking = a && mealOfAction(a.id)?.kind === 'cook';
    if (announce && a) toast(cooking ? `${a.emoji} Stopped cooking · the ingredients are back in the fridge` : `${a.emoji} Stopped ${a.label.toLowerCase()} · ${pct}% done`, { ms: 2200 });
    this.save();
    this.refreshHud(true);
  }

  /** Get up: back on your feet where you started. */
  private unpose(d: { standX: number; standZ: number }): void {
    const root = this.player.root;
    root.rotation.set(0, root.rotation.order === 'YXZ' ? root.rotation.y : root.rotation.y, 0, 'XYZ');
    root.position.set(d.standX, 0, d.standZ);
    this.player.setAction(null);
  }

  private async runAction(actionId: string, _el?: HTMLElement): Promise<void> {
    if (this.busy) return;
    // Actions that open a screen (chess, fishing, bottles…) aren't timed.
    if (this.serviceAction(actionId)) return;
    this.stopDoing();
    const r = startAction(this.state, actionId);
    if (!r.ok) return toast(r.why, { icon: '🔒', tone: 'bad' });
    this.busy = true;
    const a = r.action;
    if (a.id === 'watchTv') this.interior?.playTvAd?.();
    const bar = progressBar(`${a.emoji} ${a.label}…`);
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const f = (performance.now() - start) / (a.seconds * 1000);
        bar.set(f);
        if (f >= 1) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    bar.remove();
    const out = finishAction(this.state, a);
    if (a.id === 'lockerChange') changedClothes(this.state); // a clean shirt from your locker
    this.busy = false;
    const recovered = recordVariety(this.state, a.id);
    if (recovered) toast(recovered, { icon: '🌤️', tone: 'good', ms: 4500 });
    const path = onPathAction(this.state, a.id, a.risk ?? 0);
    if (path.caught) void this.copsSawYou(path.caught, a.label);
    else if (path.rep) toast(`+${path.rep} rep · ${pathTitle(this.state)}`, { icon: PATHS.get(this.state.paths.active!)?.emoji ?? '⭐', ms: 1800 });
    if (this.state.paths.active && !levelBlockers(this.state, this.state.paths.active).length) toast('You can level up! Phone → Life Path', { icon: '📈', tone: 'good', ms: 3500 });
    // 🪦 The darkly funny places (data/uptown.ts): what happened this time.
    const odd = oddTwist(this.state, a.id);
    if (odd) {
      this.earn('odd', POINTS.oddity, 'weird');
      this.save();
      this.refreshHud(true);
      if (odd.twist.money && odd.twist.money > 0) sfx.cash();
      void this.resultCard(odd.emoji, odd.title, `${odd.twist.text}${out.earned > 0 ? ` (+${money(out.earned)})` : ''}`);
      return;
    }
    const bits = [`${a.emoji} ${a.label} — done`];
    if (out.earned > 0) bits.push(`+${money(out.earned)}`);
    else if (a.pay && out.earned === 0 && a.id === 'lottoTicket') bits.push('no luck this time');
    toast(bits.join(' · '), { tone: 'good' });
    if (out.skillUp) {
      toast(`Skill up! ${out.skillUp.replace(/^\w/, (c) => c.toUpperCase())}`, { icon: '⭐', tone: 'good' });
      sfx.notify();
    }
    if (a.id === 'lottoTicket' && out.earned >= 50_000) {
      // A rare big win makes the city news.
      bus.emit('news:posted', { id: 'lotto' });
      this.state.news.unshift({ id: `lotto-${nowMs()}`, at: nowMs(), scope: this.state.location.area, emoji: '🎟️', headline: `${this.state.profile.name} wins ${money(out.earned)} on a bodega scratch-off`, personal: true });
    }
    this.save();
    this.refreshHud(true);
  }

  // ===================================================================
  // Work
  // ===================================================================

  /**
   * The 💼 Go to work button: already there, the shift starts. Otherwise
   * pick how to get there (walk, subway, rideshare, your car); the shift
   * starts when you walk in. No job yet: the phone's Jobs app opens.
   */
  private async goToWork(): Promise<void> {
    if (this.busy) return;
    const s = this.state;
    if (!s.job) return this.openPhoneApp('jobs');
    const block = shiftBlocker(s);
    if (block) {
      // Can't work right now: say why, and keep the quit button in reach.
      const m = openModal(`<div class="big">💼</div><h2>${esc(jobTitle(s))}</h2><p>${esc(block)}</p><div class="row" style="gap:8px;margin-top:12px"><button class="btn ghost block" data-act="quit">🚪 Quit job</button><button class="btn primary block" data-act="ok">OK</button></div>`);
      onAct(m.el, (act) => {
        m.close();
        if (act === 'quit') this.confirmQuitJob();
      });
      return;
    }
    const workplace = PLACE_BY_ID[CAREER_BY_ID[s.job.careerId].placeId];
    closeSheet();
    if (s.location.placeId === workplace.id && this.engine.mode === 'interior') return this.runShift();
    this.travelSheet(workplace, { work: true });
  }

  /** A walk you chose from the travel sheet: its toll is paid on arrival. */
  private walkTrip: { placeId: string; metres: number } | null = null;

  /** Heading to work: when you walk into this place, the shift starts. */
  private pendingShift: string | null = null;

  /** Start a shift where you are (after the commute), if you still can. */
  private async runShiftHere(): Promise<void> {
    const block = shiftBlocker(this.state);
    if (block) return toast(block, { icon: '💼', tone: 'bad' });
    if (this.busy) return;
    await this.runShift();
  }

  private async runShift(): Promise<void> {
    // Turning up with a stain: the manager notices.
    const stain = stainAtWork(this.state);
    if (stain) toast(stain, { icon: '☕', tone: 'bad', ms: 4500 });
    // Take your spot among the coworkers.
    const spot = this.myWorkSpot;
    if (spot && this.engine.mode === 'interior') {
      this.indoor = null;
      this.player.root.position.set(spot.x, 0, spot.z);
      this.player.root.rotation.y = spot.rot;
    }
    // Every job is a hands-on counter now (sim/shift.ts, data/shift-menus.ts).
    return this.runDeliShift();
  }

  /**
   * ⏩ An auto shift: 30 real seconds on a bar (Peter: you have to be
   * online for it to work). Closing the game mid-way abandons the shift
   * unpaid (sim/shift.ts → abandonShift on load). Resolves false if you
   * stopped early.
   */
  private autoShift(emoji: string): Promise<boolean> {
    return new Promise((resolve) => {
      let stopped = false;
      const total = autoSeconds() * 1000;
      const bar = progressBar(`${emoji} Working the shift…`, { skipLabel: 'Stop', onSkip: () => (stopped = true) });
      const start = performance.now();
      const tick = () => {
        const f = (performance.now() - start) / total;
        if (stopped) {
          bar.remove();
          return resolve(false);
        }
        bar.set(f, `${emoji} Working the shift… ${Math.max(0, Math.ceil((total - (performance.now() - start)) / 1000))}s`);
        if (f >= 1) {
          bar.remove();
          return resolve(true);
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /**
   * The job's own twist before the pay (sim/job-perks.ts): a fight at the
   * club, a bust in the alley, an envelope for the cop. Returns the pay
   * multiplier, or null if the shift ended badly (Internal Affairs).
   */
  private async resolveTwist(): Promise<number | null> {
    const s = this.state;
    const twist = shiftTwist(s, nycTime().hour);
    // (The bar's late-night tips are counted in the payslip itself.)
    if (!twist || (twist.kind === 'late' && s.job?.careerId === 'bartender')) return 1;
    if (twist.kind === 'bribe') {
      const take = await new Promise<boolean>((resolve) => {
        const m = openModal(`<div class="big">✉️</div><h2>An envelope</h2><p>${esc(twist.text)}</p><p class="sub">${money(twist.amount)} inside. Exposure now ${Math.round(s.exposure ?? 0)}/100.</p><div class="choices"><button class="choice" data-act="take">💵 <span>Take it<span class="hint">+${money(twist.amount)}, exposure +22</span></span></button><button class="choice" data-act="refuse">😇 <span>Hand it back<span class="hint">Stay clean</span></span></button></div>`);
        onAct(m.el, (act) => {
          m.close();
          resolve(act === 'take');
        });
      });
      const r = resolveBribe(s, take, twist.amount);
      if (r.caught) {
        sfx.bad();
        await this.showJobScene('🚔', 'Internal Affairs', r.text);
        return null;
      }
      toast(r.text, { icon: take ? '💵' : '😇', ms: 3000 });
      return 1;
    }
    if (twist.kind === 'fight') {
      if (!twist.won) sfx.bad();
      await this.showJobScene(null, twist.won ? 'You won the fight' : 'You lost the fight', twist.text, true);
      return twist.payMult;
    }
    if (twist.kind === 'busted') {
      sfx.bad();
      await this.showJobScene('🚨', 'Busted', twist.text);
      return 0;
    }
    toast(twist.text, { icon: twist.payMult >= 1 ? '🌙' : '😬', ms: 3000 });
    return twist.payMult;
  }

  /** A short job scene: an emoji (or a cartoon dust cloud for fights), a title, a line. */
  private showJobScene(emoji: string | null, title: string, text: string, dust = false): Promise<void> {
    return new Promise((resolve) => {
      const top = dust ? '<div class="dust-fight" aria-hidden="true"><span>💨</span><span>💥</span><span>💨</span><span>⭐</span></div>' : `<div class="big">${emoji}</div>`;
      const m = openModal(`${top}<h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn primary block" data-act="ok">OK</button>`);
      onAct(m.el, () => {
        m.close();
        resolve();
      });
    });
  }

  /**
   * The playable deli shift (sim/shift.ts, ui/deli-shift.ts): clock in,
   * work the counter, get a payslip. Pay goes through the shift's id, so
   * it's paid exactly once.
   */
  private async runDeliShift(): Promise<void> {
    const s = this.state;
    const career = CAREER_BY_ID[s.job!.careerId];
    const t = nycTime();
    const band = payBand(s);
    const late = career.id === 'bartender' && (t.hour >= 22 || t.hour < 4) ? 1.5 : 1;
    const left = MAX_SHIFTS_PER_DAY - (s.job!.dayKey === t.dateKey ? s.job!.shiftsToday : 0);
    const info = { place: PLACE_BY_ID[career.placeId].name, title: jobTitle(s), auto: band.auto, max: band.max, startMinute: t.hour * 60 + t.minute, hours: SHIFT_GAME_HOURS, choices: [] as string[], careerId: career.id, tipMult: late, left, played: s.shiftsPlayed?.[career.id] ?? 0 };
    const mode = await shiftIntro(info);
    if (!mode) return;
    const st = startDeliShift(s);
    if (!st.ok) return toast(st.why, { icon: '💼', tone: 'bad' });
    this.busy = true;
    this.save(); // the shift id is saved: from here on it can only pay once
    info.choices = st.session.choices;
    if (mode === 'auto' && !(await this.autoShift(career.emoji))) {
      // Stopped early (or left): the shift ends unpaid.
      abandonShift(s);
      this.busy = false;
      this.save();
      return toast('You left before the end of the shift: no pay.', { icon: '⏩', tone: 'bad' });
    }
    const play = mode === 'play' ? await playDeliShift(info) : { orders: [], picks: {}, skipped: true };
    if (mode === 'play') (s.shiftsPlayed ??= {})[career.id] = (s.shiftsPlayed[career.id] ?? 0) + 1;
    // 🏆 A played shift is worth a lot more than auto, and a clean one more again.
    const allRight = mode === 'play' && play.orders.length >= REAL_SHIFT_ORDERS && play.orders.every((o) => o.right);
    this.earn('shifts', mode === 'play' ? POINTS.shiftPlayed + (allRight ? POINTS.perfectShift : 0) : POINTS.shift, 'shift');
    const mult = await this.resolveTwist();
    if (mult === null) {
      abandonShift(s);
      this.busy = false;
      this.save();
      this.refreshHud(true);
      return;
    }
    const slip = finishDeliShift(s, st.session.id, play, Math.random, mult);
    this.busy = false;
    this.save();
    this.refreshHud(true);
    if (!slip) return;
    sfx.cash();
    await showPayslip(slip, { title: `${career.emoji} ${info.title}`, tipWord: menuFor(career.id).tipWord, auto: mode === 'auto', max: band.max, skillLabel: career.skill === 'streetSmarts' ? 'street smarts' : career.skill });
    this.save();
    this.refreshHud(true);
    await this.maybeAskForRaise();
  }

  /** Ready for a raise? Your boss has a minute: ask now (the mini-game) or later. */
  private async maybeAskForRaise(force = false): Promise<void> {
    const s = this.state;
    if (!s.job || raiseBlocker(s)) return;
    const c = CAREER_BY_ID[s.job.careerId];
    const info = { raise: s.job.level + 1, boss: 'Your manager', from: { title: c.ladder[s.job.level].title, pay: payBand(s, s.job.level).max }, to: { title: c.ladder[s.job.level + 1].title, pay: payBand(s, s.job.level + 1).max } };
    if (!force && !(await offerRaise(info))) return;
    const won = await playRaiseGame(info);
    const title = resolveRaise(s, won);
    this.save();
    this.refreshHud(true);
    if (title) {
      sfx.notify();
      s.news.unshift({ id: `promo-${nowMs()}`, at: nowMs(), scope: s.location.area, emoji: '📈', headline: `${s.profile.name} got a raise: now ${title}`, personal: true });
      const m = openModal(`<div class="big">📈</div><h2>You got the raise!</h2><p>You’re now <b>${esc(title)}</b>: ${money(payBand(s).auto)} auto, up to <b>${money(info.to.pay)}</b> a shift.</p><button class="btn primary block" data-act="ok">Let’s go</button>`);
      onAct(m.el, () => m.close());
    } else {
      sfx.bad();
      toast('“Not right now.” Work a couple more shifts and ask again.', { icon: '😐', ms: 3500 });
    }
  }



  // ===================================================================
  // Travel
  // ===================================================================

  /**
   * The Map button (Peter, 2026-10-14): a short list of where you might
   * want to go (home, work, plans, recent and nearby places), with the
   * satellite map and the city map one tap away.
   */
  /** Places to fast-travel to: home, work, plans, recent, a few nearby (the "Where to?" list and the map strip). */
  private quickRows(): { place: PlaceDef; tag: string }[] {
    const s = this.state;
    const seen = new Set<string>();
    const rows: { place: PlaceDef; tag: string }[] = [];
    const add = (id: string | null | undefined, tag: string) => {
      const p = id ? PLACE_BY_ID[id] : null;
      if (!p || seen.has(p.id) || !isOpenArea(p.area)) return;
      seen.add(p.id);
      rows.push({ place: p, tag });
    };
    add(s.home.placeId, PLACE_BY_ID[s.home.placeId]?.name ?? 'Your place');
    if (s.job) add(CAREER_BY_ID[s.job.careerId].placeId, 'Work');
    for (const inv of socialOf(s).invites) if (inv.status === 'accepted' && inv.until > nowMs()) add(inv.placeId, `Plans: ${OUTINGS[inv.outing].emoji} ${clockLabel(nycTime(inv.at))}`);
    for (const id of s.recentPlaces ?? []) add(id, 'Recent');
    // A few open places close by.
    const at = this.engine.mode === 'city' ? this.player.root.position : new THREE.Vector3(s.location.x, 0, s.location.z);
    const h = nycTime().hour;
    Object.values(PLACE_BY_ID)
      .filter((p) => p.area === s.location.area && p.type !== 'home' && p.type !== 'station' && p.interior !== 'none' && isOpen(p, h))
      .map((p) => ({ p, d: Math.hypot(doorOf(p).x - at.x, doorOf(p).z - at.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .forEach(({ p, d }) => add(p.id, `Nearby · ${Math.max(1, Math.round(d / 80))} min walk`));
    return rows;
  }

  private openQuickTravel(): void {
    const s = this.state;
    const here = s.location.placeId;
    const rows = this.quickRows();
    const sheet = openSheet({
      emoji: '🗺️',
      title: 'Where to?',
      sub: here ? `You’re at ${esc(here === s.home.placeId ? 'home' : PLACE_BY_ID[here]?.name ?? 'a place')}` : 'You’re outside',
      body: `<div class="travel">${rows
        .map(({ place, tag }) => `<button class="opt" data-act="go:${place.id}" ${place.id === here ? 'disabled aria-disabled="true"' : ''}><span style="font-size:24px">${place.id === s.home.placeId ? '🏠' : place.emoji}</span><span class="grow"><b>${esc(place.id === s.home.placeId ? 'Home' : place.name)}</b><small>${esc(place.id === here ? 'You’re here' : tag)}</small></span></button>`)
        .join('')}</div>
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" style="flex:1" data-act="sat">🛰️ Satellite map</button><button class="btn" style="flex:1" data-act="flat">🗺️ City map</button></div>`,
    });
    onAct(sheet.body, (act) => {
      if (act === 'sat' || act === 'flat') {
        sheet.close();
        return void window.setTimeout(() => (act === 'sat' ? this.openCityMap() : this.openMapOverlay()), 150);
      }
      if (act.startsWith('go:')) {
        const p = PLACE_BY_ID[act.slice(3)];
        if (p) this.travelSheet(p);
      }
    });
  }

  // ---- The map: the real 3D city from the sky (ui/map3d.ts) ----
  private map3d: Map3D | null = null;
  private map3dSaved: (() => void) | null = null;

  private openCityMap(): void {
    if (!this.city || this.busy || this.engine.mode === 'transit') return this.openMapOverlay();
    sfx.tap();
    const { camera, controls } = this.engine;
    const fog = this.engine.cityScene.fog as THREE.Fog;
    const saved = {
      pos: camera.position.clone(), target: controls.target.clone(), follow: this.followCamera, min: controls.minDistance, max: controls.maxDistance,
      minPolar: controls.minPolarAngle, maxPolar: controls.maxPolarAngle, pan: controls.enablePan, rotate: controls.enableRotate, ssp: controls.screenSpacePanning, damping: controls.enableDamping, touches: { ...controls.touches }, mouse: { ...controls.mouseButtons },
      near: fog.near, far: fog.far, camFar: camera.far, camNear: camera.near, mode: this.engine.mode,
    };
    this.map3dSaved = () => {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
      this.followCamera = saved.follow;
      Object.assign(controls, { minDistance: saved.min, maxDistance: saved.max, minPolarAngle: saved.minPolar, maxPolarAngle: saved.maxPolar, enablePan: saved.pan, enableRotate: saved.rotate, screenSpacePanning: saved.ssp, enableDamping: saved.damping });
      controls.touches = saved.touches;
      controls.mouseButtons = saved.mouse;
      fog.near = saved.near;
      fog.far = saved.far;
      camera.far = saved.camFar;
      camera.near = saved.camNear;
      camera.updateProjectionMatrix();
      this.engine.mode = saved.mode;
      controls.update();
    };
    // Lift the camera into the sky over where you are.
    this.engine.mode = 'city';
    this.followCamera = false;
    // The tilted sky view (Peter, 2026-10-14: back to the tilt; only the flat city map is straight down).
    // No glide: the map stops the moment you let go (the glide read as "the map follows my mouse").
    Object.assign(controls, { minDistance: 70, maxDistance: MAP_MAX_DISTANCE, minPolarAngle: 0.15, maxPolarAngle: 1.05, enablePan: true, enableRotate: true, screenSpacePanning: false, enableDamping: false });
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    fog.near = 4000;
    fog.far = 9000;
    camera.far = Math.max(camera.far, 9500); // zoomed all the way out you see the whole island
    camera.near = 4; // high in the sky: a bigger near plane keeps flat things from flickering
    camera.updateProjectionMatrix();
    const onStreet = saved.mode === 'city';
    const px = onStreet ? this.player.root.position.x : this.state.location.x;
    const pz = onStreet ? this.player.root.position.z : this.state.location.z;
    // Open fully zoomed out (about three quarters of Manhattan), centred across
    // the island and as close to you north-south as the edges allow.
    const span = MAP_SPAN_FRACTION * (MANHATTAN_BOUNDS.maxZ - MANHATTAN_BOUNDS.minZ);
    const manhattan = this.city.area === 'manhattan';
    const cx = manhattan ? (MANHATTAN_BOUNDS.minX + MANHATTAN_BOUNDS.maxX) / 2 : px;
    const cz = manhattan ? THREE.MathUtils.clamp(pz, MANHATTAN_BOUNDS.minZ + span / 2, MANHATTAN_BOUNDS.maxZ - span / 2) : pz;
    controls.target.set(cx, 0, cz);
    // The old tilt (looking north, ~34° from straight down), from the furthest zoom-out.
    const dir = new THREE.Vector3(60, 540, 360).normalize();
    camera.position.set(cx, 0, cz).addScaledVector(dir, MAP_MAX_DISTANCE);
    controls.update();
    this.hud?.setVisible(false);
    const d = DISTRICTS[this.city.area];
    this.map3d = openMap3D({
      area: this.city.area,
      borough: d.borough,
      onGang: (on) => this.showTurf(on),
      areaName: d.name,
      hour: nycTime().hour,
      homeId: this.state.home.placeId,
      billboards: this.city.adSlots.map((a) => ({ id: a.id, center: a.center, tier: a.tier })),
      player: () => ({ x: px, z: pz }),
      // The travel options open over the map; the map closes only once you pick a way to go.
      onPlace: (place) => this.travelSheet(place, { beforeGo: () => this.closeCityMap() }),
      // The ad card opens over the map: you stay on the map (Peter, 2026-10-14).
      onBillboard: (id) => this.openAdCard(id),
      // Plots for rent open on top of the map, so you can keep browsing.
      onPlot: (id) => PLOT_BY_ID[id] && openPlotPanel(PLOT_BY_ID[id]),
      onWholeCity: () => {
        this.closeCityMap();
        this.openMapOverlay(true);
      },
      onCenter: () => {
        // Slide the view (same height and angle) so you're in the middle.
        sfx.tap();
        const me = this.engine.mode === 'city' && saved.mode === 'city' ? this.player.root.position : new THREE.Vector3(this.state.location.x, 0, this.state.location.z);
        const shift = new THREE.Vector3(me.x - controls.target.x, 0, me.z - controls.target.z);
        controls.target.add(shift);
        camera.position.add(shift);
        controls.update();
      },
      onClose: () => this.closeCityMap(),
    });
    this.overlayClose = () => this.closeCityMap();
    this.showMapStrip(() => this.closeCityMap());
  }

  /**
   * On either map: a 🚀 Fast travel button that opens a list of places you
   * can go (home, work, plans, recent, nearby) and closes again (Peter, 2026-10-14).
   */
  private mapStrip: HTMLElement | null = null;
  private showMapStrip(closeMap: () => void): void {
    this.hideMapStrip();
    const s = this.state;
    const here = s.location.placeId;
    const rows = this.quickRows();
    if (!rows.length) return;
    const el = document.createElement('div');
    el.className = 'map-fast';
    el.innerHTML = `<button class="map-fast-btn" data-fast aria-expanded="false">🚀 Fast travel</button>
      <div class="map-fast-list" role="dialog" aria-label="Fast travel" hidden>
        <div class="map-fast-head"><b>🚀 Fast travel</b><button class="close" data-fastclose aria-label="Close">✕</button></div>
        <div class="map-fast-rows">${rows
          .map(({ place, tag }) => `<button data-go="${place.id}" ${place.id === here ? 'disabled' : ''}><span>${place.id === s.home.placeId ? '🏠' : place.emoji}</span><b>${esc(place.id === s.home.placeId ? 'Home' : place.name)}</b><small>${esc(place.id === here ? 'You’re here' : tag)}</small></button>`)
          .join('')}</div>
      </div>`;
    const list = el.querySelector<HTMLElement>('.map-fast-list')!;
    const btn = el.querySelector<HTMLElement>('[data-fast]')!;
    const setOpen = (open: boolean) => {
      list.hidden = !open;
      btn.hidden = open;
      btn.setAttribute('aria-expanded', String(open));
    };
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-fast]')) return setOpen(true);
      if (t.closest('[data-fastclose]')) return setOpen(false);
      const id = t.closest<HTMLElement>('[data-go]')?.dataset.go;
      if (!id || !PLACE_BY_ID[id]) return;
      this.travelSheet(PLACE_BY_ID[id], {
        beforeGo: () => {
          this.hideMapStrip();
          closeMap();
        },
      });
    });
    // Scrolling the list must never pan or zoom the map underneath.
    for (const type of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'pointermove'] as const) el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    (document.getElementById('ui') ?? document.body).appendChild(el);
    this.mapStrip = el;
  }

  private hideMapStrip(): void {
    this.mapStrip?.remove();
    this.mapStrip = null;
  }

  /** Gang view in the sky map: tint crew turf blocks (safe areas stay clear). */
  private turfGroup: THREE.Group | null = null;
  private showTurf(on: boolean): void {
    this.turfGroup?.removeFromParent();
    this.turfGroup?.traverse((o) => ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.dispose?.());
    this.turfGroup = null;
    if (!on || !this.city) return;
    const area = this.city.area;
    if (SAFE_AREAS.includes(area)) {
      toast(`${DISTRICTS[area].name} is a safe zone — no crews here.`, { icon: '🕊️', ms: 3500 });
      return;
    }
    const d = DISTRICTS[area];
    const g = new THREE.Group();
    const mats = new Map<string, THREE.MeshBasicMaterial>();
    for (const t of turfMap(this.state, area)) {
      const b = blockRect(d, t.c, t.r);
      let m = mats.get(t.crew.color);
      if (!m) mats.set(t.crew.color, (m = new THREE.MeshBasicMaterial({ color: t.crew.color, transparent: true, opacity: 0.45, depthWrite: false })));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ).rotateX(-Math.PI / 2), m);
      mesh.position.set((b.minX + b.maxX) / 2, t.base ? 70 : 45, (b.minZ + b.maxZ) / 2);
      g.add(mesh);
    }
    this.engine.cityScene.add(g);
    this.turfGroup = g;
  }

  private closeCityMap(): void {
    if (!this.map3d) return;
    this.showTurf(false);
    this.map3d.close();
    this.map3d = null;
    this.hideMapStrip();
    this.map3dSaved?.();
    this.map3dSaved = null;
    this.overlayClose = null;
    this.hud?.setVisible(true);
  }

  /** The flat map (ui/map.ts): borough by borough, or the whole city. */
  private openMapOverlay(whole = false): void {
    const s = this.state;
    const p = this.player.root.position;
    this.overlayClose = openMap({
      area: s.location.area,
      whole,
      state: s,
      player: { area: s.location.area, x: this.engine.mode === 'city' ? p.x : s.location.x, z: this.engine.mode === 'city' ? p.z : s.location.z },
      hour: nycTime().hour,
      billboards: this.city ? this.city.adSlots.map((a) => ({ id: a.id, x: a.center.x, z: a.center.z, tier: a.tier })) : [],
      onPick: (id) => this.travelSheet(PLACE_BY_ID[id], { beforeGo: () => this.overlayClose?.() }),
      onBillboard: (id) => this.openAdCard(id),
      onPlot: (id) => PLOT_BY_ID[id] && openPlotPanel(PLOT_BY_ID[id]),
      onFlyover: () => window.setTimeout(() => this.openCityMap(), 0),
      onBuyMap: () => {
        const why = buyCityMap(s);
        if (why) {
          toast(why, { icon: '🗺️', tone: 'bad' });
          return false;
        }
        sfx.cash();
        toast('🗺️ Full City Map: every place in the city is on your map now. Filter by kind at the bottom.', { icon: '🗺️', tone: 'good', ms: 4500 });
        this.save();
        this.refreshHud(true);
        return true;
      },
      onClose: () => {
        this.overlayClose = null;
        this.hideMapStrip();
      },
    });
    const close = this.overlayClose;
    this.showMapStrip(() => close?.());
  }

  /** Rideshare price: base + distance, times surge (rush hour, bad weather). */
  rideQuote(placeId: string, luxury: boolean): { cost: number; minutes: number; surge: number } {
    const s = this.state;
    const place = PLACE_BY_ID[placeId];
    const d = doorOf(place);
    const t = nycTime();
    const crossing = place.area !== s.location.area;
    const dist = crossing ? 3_500 : Math.hypot(d.x - s.location.x, d.z - s.location.z);
    let surge = 1;
    if (isRushHour(t)) surge += 0.6;
    surge += weatherDef(weatherFor(t.dateKey, t.hour)).surge ?? 0;
    if (t.hour >= 1 && t.hour < 5) surge += 0.3;
    let cost = Math.max(RIDESHARE.minFare, RIDESHARE.base + Math.round((dist / 100) * RIDESHARE.per100m)) * surge;
    if (luxury) cost *= RIDESHARE.luxuryMultiplier;
    cost = Math.round(cost / 25) * 25;
    const minutes = Math.max(3, Math.round(dist / 260 + (surge > 1.4 ? 4 : 1)));
    return { cost, minutes, surge };
  }

  /**
   * How to get somewhere. `beforeGo` runs once you pick a way to travel
   * (the maps stay open underneath until then, so a tap you don't follow
   * through leaves you on the map).
   */
  private travelSheet(place: PlaceDef, opts: { work?: boolean; beforeGo?: () => void } = {}): void {
    if (!isOpenArea(place.area)) return void toast(`${DISTRICTS[place.area].name} isn’t open yet — it’s Manhattan only for now.`, { icon: '🚧' });
    const s = this.state;
    if (!opts.work && s.location.placeId === place.id && this.engine.mode === 'interior') return void toast(`You’re already at ${place.id === s.home.placeId ? 'home' : place.name}.`, { icon: '📍' });
    // 💻 Tech perk: once a day, work from home instead of commuting.
    const remote = !!opts.work && s.job?.careerId === 'tech' && s.location.placeId === s.home.placeId && s.job.remoteDay !== nycTime().dateKey;
    const same = place.area === s.location.area;
    const ride = this.rideQuote(place.id, false);
    const lux = this.rideQuote(place.id, true);
    const d = doorOf(place);
    const walkMin = Math.max(1, Math.round(Math.hypot(d.x - s.location.x, d.z - s.location.z) / 80));
    const open = isOpen(place, nycTime().hour);
    const sheet = openSheet({
      emoji: opts.work ? '💼' : place.emoji,
      title: opts.work ? `Go to work: ${place.name}` : place.name,
      sub: `${DISTRICTS[place.area].name} · ${opts.work ? 'your shift starts when you get there' : open ? 'open now' : 'closed now'}`,
      body: `${opts.work ? '' : `<p class="blurb">${esc(place.blurb)}</p>`}${remote ? '<div class="travel"><button class="opt" data-act="remote"><span style="font-size:24px">🏠</span><span class="grow"><b>Work from home today</b><small>💻 Tech perk · once a day · no commute</small></span><span class="cost">Free</span></button></div>' : ''}
        <div class="travel">
          ${same ? `<button class="opt" data-act="walk"><span style="font-size:24px">🚶</span><span class="grow"><b>Walk</b><small>about ${walkMin} min</small></span><span class="cost">Free</span></button>` : ''}
          ${s.garage.cars.length ? `<button class="opt" data-act="drive"><span style="font-size:24px">🚗</span><span class="grow"><b>Drive there</b><small>your own car${licenceSuspended(s) ? ' · ⚠️ licence suspended' : ''}</small></span><span class="cost">${money(GARAGE.tripCost)}</span></button>
          <button class="opt" data-act="floor"><span style="font-size:24px">🏎️</span><span class="grow"><b>Floor it</b><small>twice as fast · fun · risk of a ticket</small></span><span class="cost">${money(GARAGE.tripCost)}</span></button>` : ''}
          <button class="opt" data-act="subway"><span style="font-size:24px">🚇</span><span class="grow"><b>Subway</b><small>${same ? 'a couple of stops' : `to ${DISTRICTS[place.area].name}`}</small></span><span class="cost">${money(SUBWAY_FARE)}</span></button>
          <button class="opt" data-act="ride" ${s.phone.ok ? '' : 'disabled aria-disabled="true"'}><span style="font-size:24px">🚗</span><span class="grow"><b>Rideshare</b><small>${s.phone.ok ? `${ride.minutes} min${ride.surge > 1 ? ` · ⚡ surge ×${ride.surge.toFixed(1)}` : ''}` : 'needs your phone'}</small></span><span class="cost">${money(ride.cost)}</span></button>
          <button class="opt" data-act="lux" ${s.phone.ok ? '' : 'disabled aria-disabled="true"'}><span style="font-size:24px">🖤</span><span class="grow"><b>Rideshare Black</b><small>leather seats, bottled water · 🔥 +street rep</small></span><span class="cost">${money(lux.cost)}</span></button>
        </div>${opts.work && s.job ? '<button class="btn ghost block" style="margin-top:12px" data-act="quitjob">🚪 Quit this job</button>' : ''}`,
    });
    onAct(sheet.body, (act) => {
      sheet.close();
      if (act === 'quitjob') return void this.confirmQuitJob();
      opts.beforeGo?.();
      if (act === 'remote' && s.job) {
        s.job.remoteDay = nycTime().dateKey;
        toast('Working from home today. Camera off.', { icon: '🏠', ms: 2500 });
        return void this.runShift();
      }
      this.pendingShift = opts.work ? place.id : null;
      if (act === 'walk') {
        const metres = Math.hypot(d.x - s.location.x, d.z - s.location.z);
        this.walkTrip = { placeId: place.id, metres };
        // A long walk (Peter, 2026-10-15): an ad, then a few seconds of you
        // walking up to the door. A short one is just walked.
        if (metres / WALK_SPEED > TRAVEL_SECONDS.walkLive) return void this.walkFast(place.id);
        if (this.engine.mode === 'interior') this.leaveInterior();
        window.setTimeout(() => this.walkToPlace(place.id), this.engine.mode === 'interior' ? 400 : 0);
      }
      if (act === 'drive') this.driveTo(place.id, false);
      if (act === 'floor') this.driveTo(place.id, true);
      if (act === 'subway') void this.rideTrain(place.area, place.id);
      if (act === 'ride') this.rideshare(place.id, false);
      if (act === 'lux') this.rideshare(place.id, true);
    });
  }

  /** Quit your job, after a "you sure?" (Peter, 2026-10-15: a quit button you can find). */
  private confirmQuitJob(): void {
    const s = this.state;
    if (!s.job) return;
    const c = CAREER_BY_ID[s.job.careerId];
    const m = openModal(`<div class="big">🚪</div><h2>Quit ${esc(c.name)}?</h2><p>You lose your level (${esc(jobTitle(s))}) and your raise progress. You can apply somewhere else straight away.</p><div class="row" style="gap:8px;margin-top:12px"><button class="btn block" data-act="no">Stay</button><button class="btn primary block" data-act="yes">Quit</button></div>`);
    onAct(m.el, (act) => {
      m.close();
      if (act !== 'yes') return;
      quitJob(s);
      sfx.door();
      toast(`You quit. Boss pretended not to care. 🫡`, { icon: '🚪', ms: 3500 });
      this.save();
      this.refreshHud(true);
    });
  }

  /**
   * 🥊 A fight you play (ui/minigames.ts). Applies the result (rep, ER)
   * and shows it. Resolves with whether you won.
   */
  private async runFight(foe: string, emoji: string, power: number, title?: string): Promise<boolean> {
    const setup = fightSetup(this.state, foe, emoji, power);
    const prevBusy = this.busy;
    this.busy = true;
    const r = await playFight(setup, { title });
    const out = finishFight(this.state, setup, r.won, r.hpLeft);
    const st = this.state.stats;
    if (out.won) {
      st.fightsWon = (st.fightsWon ?? 0) + 1;
      this.credit('fightWon');
      this.earn('fights', POINTS.fightWon, 'fightWon');
    } else st.fightsLost = (st.fightsLost ?? 0) + 1;
    this.busy = prevBusy;
    await this.resultCard(out.won ? '🏆' : '🤕', out.won ? 'You won the fight' : 'You lost the fight', `${out.text} ${repLine('street', out.repDelta)}.${out.title ? ` You're now ${out.title}!` : ''}`);
    this.save();
    this.refreshHud(true);
    return out.won;
  }

  /**
   * 🚔 The cops saw you. If a chase is due (not too often), you run for it;
   * get away and it's street rep, get caught and it's the arrest.
   */
  private async copsSawYou(b: Bust, what: string): Promise<void> {
    const s = this.state;
    if (!chaseReady(s)) {
      sfx.bad();
      toast(bustNow(s, b), { tone: 'bad', ms: 5000 });
      this.save();
      return;
    }
    markChase(s);
    const got = await this.runChase(heatFor(s, b.risk), `Someone saw you: ${what.toLowerCase()}.`);
    if (!got) {
      sfx.bad();
      await this.resultCard('🚔', 'Caught', bustNow(s, b));
    }
    this.save();
    this.refreshHud(true);
  }

  /** Run from the police. True = you got away (rep applied, line shown). */
  private async runChase(heat: number, reason: string): Promise<boolean> {
    const s = this.state;
    const prevBusy = this.busy;
    this.busy = true;
    const r = await playChase(chaseSetup(s, heat), { reason });
    this.busy = prevBusy;
    if (r.cash > 0) changeMoney(s, r.cash, '💵 Picked up on the run');
    if (!r.escaped) {
      s.stats.chasesCaught = (s.stats.chasesCaught ?? 0) + 1;
      return false;
    }
    s.stats.chasesEscaped = (s.stats.chasesEscaped ?? 0) + 1;
    this.credit('chaseEscaped');
    this.earn('chases', POINTS.chaseEscaped * heat);
    const e = chaseEscaped(s, heat);
    await this.resultCard('💨', 'You got away', `${e.text} ${repLine('street', e.repDelta)}.${e.title ? ` You're now ${e.title}!` : ''}`);
    return true;
  }

  /** A simple "here's what happened" card. */
  private resultCard(emoji: string, title: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      const m = openModal(`<div class="big">${emoji}</div><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn primary block" data-act="ok">OK</button>`);
      onAct(m.el, () => {
        m.close();
        resolve();
      });
    });
  }

  /** Out onto the street right away (no door animation): for trips that start indoors. */
  private toStreetNow(): void {
    if (this.engine.mode === 'interior' || this.engine.mode === 'transit') {
      this.stopDoing();
      this.indoor = null;
      this.interior?.dispose();
      this.interior = null;
      this.engine.cityScene.add(this.player.root);
      this.setMode('city');
      this.engine.altScene = null;
    }
    this.state.location.placeId = null;
  }

  /** A travel loading screen: the ad, with a bar that fills over `seconds`. */
  private async travelAd(seconds: number, text: string, sub: string): Promise<void> {
    fade(true, text, sub, { ...nextTravelAd(), seconds });
    await wait(seconds * 1000);
  }

  /**
   * A long walk: the ad (~11 s), then you, a few steps from the door,
   * walking the last stretch (~4 s) and in. ~15 s in all.
   */
  private async walkFast(placeId: string): Promise<void> {
    if (this.busy || !this.city) return;
    const place = PLACE_BY_ID[placeId];
    this.busy = true;
    closeSheet();
    sfx.tap();
    this.stopMoving(true);
    // Where you set off from, on the street (indoors: that building's door).
    const wasOutside = this.engine.mode === 'city';
    const from = wasOutside ? this.player.root.position.clone() : new THREE.Vector3(this.state.location.x, 0, this.state.location.z);
    await this.travelAd(TRAVEL_SECONDS.walkAd, '🚶 Walking over', `To ${place.name}`);
    this.toStreetNow();
    if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
    // Start the last stretch: a point on the way, about walkScene seconds out.
    const door = doorOf(place);
    const path = findPath(this.city!.nav, door.x, door.z, from.x, from.z);
    const want = WALK_SPEED * TRAVEL_SECONDS.walkScene;
    let start = { x: door.x + door.faceX * want, z: door.z + door.faceZ * want };
    let run = 0;
    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      if (run + seg >= want) {
        // Part way along this stretch of the route.
        const f = (want - run) / (seg || 1);
        start = { x: path[i - 1].x + (path[i].x - path[i - 1].x) * f, z: path[i - 1].z + (path[i].z - path[i - 1].z) * f };
        break;
      }
      run += seg;
    }
    const near = nearestWalkable(this.city!.nav, start.x, start.z);
    this.state.location = { area: place.area, placeId: null, x: near.x, z: near.z };
    this.placePlayerAtLocation();
    fade(false);
    this.busy = false;
    this.walkToPlace(place.id);
  }

  /** Take the subway. Across boroughs this plays the train ride while the next area loads. */
  private async rideTrain(area: AreaId, placeId: string | null, free = false): Promise<void> {
    if (this.busy) return;
    if (!isOpenArea(area)) return void toast(`${DISTRICTS[area].name} isn’t open yet — it’s Manhattan only for now.`, { icon: '🚧' });
    if (!free) {
      const r = changeMoney(this.state, -SUBWAY_FARE, 'Subway fare');
      if (!r.ok) return toast('Not enough for the fare ($2.90)', { icon: '🚇', tone: 'bad' });
    }
    this.busy = true;
    closeSheet();
    sfx.chime();
    this.earn('subway', 0, 'subway');
    // ~10 s in all (Peter, 2026-10-15): the ad, then the train car.
    await this.travelAd(TRAVEL_SECONDS.trainAd, 'Stand clear of the closing doors…', `🚇 To ${placeId ? PLACE_BY_ID[placeId].name : DISTRICTS[area].name}`);
    const leavingInterior = this.engine.mode === 'interior';
    if (leavingInterior) {
      this.interior?.dispose();
      this.interior = null;
    }
    // Board: show the train car.
    this.transit?.dispose();
    this.transit = buildSubwayRide(this.engine.renderer.domElement.clientWidth / this.engine.renderer.domElement.clientHeight);
    this.engine.altScene = this.transit.scene;
    this.engine.altCamera = this.transit.camera;
    this.setMode('transit');
    fade(false);
    const rideUi = html(`<div class="ride-ui"><span class="chip">🚇 To ${DISTRICTS[area].name}</span><button class="chip" data-act="skip">Skip ⏭</button></div>`);
    root().appendChild(rideUi);
    let skip = false;
    onAct(rideUi, () => (skip = true));
    // While the train rolls, build the destination (if it's a different area).
    await wait(60);
    if (!this.city || this.city.area !== area) this.loadArea(area);
    // A random event may happen on board.
    let eventShown = false;
    if (Math.random() < 0.4) {
      const ev = directorPick(this.state, 'subway', true);
      if (ev) {
        await this.showEvent(ev, 'subway');
        eventShown = true;
      }
    }
    // Or something happens on the train: a spill, or a fight.
    const incident = eventShown ? null : subwayIncident(this.state, Math.random, { playable: true });
    if (incident?.kind === 'brawl') await this.subwayBrawl(incident);
    else if (incident) await this.showIncident(incident);
    const rideStart = performance.now();
    while (!skip && performance.now() - rideStart < TRAVEL_SECONDS.trainScene * 1000) await wait(100);
    rideUi.remove();
    fade(true);
    await wait(300);
    this.transit.dispose();
    this.transit = null;
    // Arrive: at the place itself when there is one (the stop is right
    // outside), else at the station.
    const station = stationOf(area);
    const sd = placeId ? doorOf(PLACE_BY_ID[placeId]) : doorOf(station);
    this.state.location = { area, placeId: null, x: sd.x, z: sd.z };
    if (!placeId && !this.state.stats.placesVisited.includes(station.id)) this.state.stats.placesVisited.push(station.id);
    this.engine.cityScene.add(this.player.root);
    this.setMode('city');
    this.engine.altScene = null;
    this.placePlayerAtLocation();
    fade(false);
    this.busy = false;
    this.save();
    if (placeId) {
      const dest = PLACE_BY_ID[placeId];
      toast(`Arrived at ${dest.name}`, { icon: '🚇' });
      // Going to work: straight in (the shift starts inside).
      if (this.pendingShift === dest.id || (dest.type === 'work' && dest.id === CAREER_BY_ID[this.state.job?.careerId ?? '']?.placeId && this.state.job)) this.enterInterior(dest, false);
      else window.setTimeout(() => this.openPlace(dest), 300);
    } else toast(`Arrived at ${station.name}`, { icon: '🚇' });
  }

  /** Someone wants to fight on the train: square up (and play it) or switch cars. */
  private subwayBrawl(b: { text: string; foe: string; emoji: string; power: number }): Promise<void> {
    return new Promise((resolve) => {
      const m = openModal(`<div class="big">${b.emoji}</div><h2>Trouble on the train</h2><p>${esc(b.text)}</p><div class="choices"><button class="choice" data-act="fight">🥊 <span>Square up<span class="hint">win: 🔥 street rep · lose: 🔥 rep down</span></span></button><button class="choice" data-act="walk">🚶 <span>Move to the next car<span class="hint">no harm done, slightly less cool</span></span></button></div>`);
      onAct(m.el, async (act) => {
        m.close();
        if (act === 'fight') await this.runFight(b.foe, b.emoji, b.power, '🚇 Fight on the train');
        else {
          applyNeeds(this.state, { fun: -3 });
          toast('You moved cars. He’s still muttering about it.', { icon: '🚶', ms: 3000 });
        }
        resolve();
      });
    });
  }

  /** A subway spill or fight. Fights get a cartoon dust cloud, never anything graphic. */
  private showIncident(inc: Exclude<NonNullable<ReturnType<typeof subwayIncident>>, { kind: 'brawl' }>): Promise<void> {
    if (inc.kind === 'fight') sfx.bad();
    return new Promise((resolve) => {
      const top = inc.kind === 'spill' ? '<div class="big">☕</div><h2>Spill on the train</h2>' : `<div class="dust-fight" aria-hidden="true"><span>💨</span><span>💥</span><span>💨</span><span>⭐</span></div><h2>${inc.won ? 'You won the fight' : 'You lost the fight'}</h2>`;
      const m = openModal(`${top}<p>${esc(inc.text)}</p>${inc.kind === 'spill' ? '<p class="sub">Change clothes before work, or your manager will notice.</p>' : ''}<button class="btn primary block" data-act="ok">OK</button>`);
      onAct(m.el, () => {
        m.close();
        this.save();
        this.refreshHud(true);
        resolve();
      });
    });
  }

  /** Call a rideshare: pay, short "ride" fade, arrive at the door. */
  rideshare(placeId: string, luxury: boolean): void {
    if (this.busy) return;
    if (PLACE_BY_ID[placeId] && !isOpenArea(PLACE_BY_ID[placeId].area)) return void toast('That’s outside Manhattan — not open yet.', { icon: '🚧' });
    const s = this.state;
    if (!s.phone.ok) return toast('You need your phone to call a ride.', { icon: '📵', tone: 'bad' });
    const q = this.rideQuote(placeId, luxury);
    const r = changeMoney(s, -q.cost, luxury ? 'Rideshare Black' : 'Rideshare');
    if (!r.ok) return toast(`That ride is ${money(q.cost)}. Not enough cash.`, { icon: '🚗', tone: 'bad' });
    this.busy = true;
    closeSheet();
    const place = PLACE_BY_ID[placeId];
    const cars = ['Toyota Camry', 'Honda Accord', 'Toyota Sienna', 'Tesla Model 3'];
    const car = luxury ? 'Cadillac Escalade' : cars[Math.floor(Math.random() * cars.length)];
    fade(true, `🚗 Your ${car} is here`, `Riding to ${place.name}${place.area !== s.location.area ? ' — over the bridge' : ''}`, { ...nextTravelAd(), seconds: TRAVEL_SECONDS.ride });
    // Rideshare Black earns a little street rep (Peter, 2026-10-15), at most every couple of game hours.
    let blackRep: string | null = null;
    if (luxury) {
      const now = nowMs();
      if (now - (s.stats.lastBlackCar ?? 0) >= gameMinutesToRealMs(BLACK_CAR_REP.everyGameMinutes)) {
        s.stats.lastBlackCar = now;
        blackRep = addRep(s, 'street', BLACK_CAR_REP.points) ?? '';
      }
    }
    window.setTimeout(() => {
      if (this.engine.mode === 'interior') {
        this.interior?.dispose();
        this.interior = null;
        this.engine.cityScene.add(this.player.root);
        this.setMode('city');
        this.engine.altScene = null;
      }
      if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
      const d = doorOf(place);
      this.state.location = { area: place.area, placeId: null, x: d.x, z: d.z };
      this.placePlayerAtLocation();
      fade(false);
      this.busy = false;
      toast(`${luxury ? 'Five stars. ' : ''}Dropped off at ${place.name}`, { icon: '📍' });
      if (blackRep !== null) window.setTimeout(() => toast(blackRep ? `Pulled up in a Black car: 🔥 +${BLACK_CAR_REP.points} street rep. You're now ${blackRep}!` : `Pulled up in a Black car: 🔥 +${BLACK_CAR_REP.points} street rep`, { icon: '🖤', tone: 'good', ms: 3200 }), 1200);
      this.save();
      window.setTimeout(() => this.openPlace(place), 400);
    }, TRAVEL_SECONDS.ride * 1000);
  }

  // ===================================================================
  // Random events
  // ===================================================================

  private whereNow(): EventContext['where'] {
    if (this.engine.mode === 'transit') return 'subway';
    const id = this.state.location.placeId;
    if (id) {
      const p = PLACE_BY_ID[id];
      return p.id === this.state.home.placeId ? 'home' : p.type;
    }
    // Outside: are we standing in a plaza or park?
    const p = this.player.root.position;
    const d = DISTRICTS[this.state.location.area];
    for (let c = 0; c < d.cols; c++)
      for (let r = 0; r < d.rows; r++) {
        const b = blockRect(d, c, r);
        if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) {
          const k = d.kind(c, r);
          if (k === 'plaza') return 'plaza';
          if (k === 'park') return 'park';
        }
      }
    return 'street';
  }

  private maybeRandomEvent(): void {
    if (this.busy || this.overlayClose || isSheetOpen() || document.querySelector('.modal-wrap')) return;
    const where = this.whereNow();
    if (where === 'home') return; // your apartment is a safe space
    const ev = directorPick(this.state, where);
    if (ev) void this.showEvent(ev, where);
  }

  private showEvent(ev: RandomEventDef, where: EventContext['where']): Promise<void> {
    const ctx = buildContext(this.state, where);
    const choices = ev.choices.filter((c) => !c.show || c.show(ctx));
    sfx.notify();
    return new Promise((resolve) => {
      const rar = RARITY[ev.rarity ?? 'common'];
      const badge = rar.label ? `<div class="rarity" style="--rc:${rar.color}">${rar.label}</div>` : '';
      const m = openModal(`${badge}<div class="big">${ev.emoji}</div><h2>${esc(ev.title)}</h2><p>${esc(ev.text(ctx))}</p><div class="choices">${choices.map((c, i) => `<button class="choice" data-act="${i}">${c.emoji} <span>${esc(c.label)}${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''}</span></button>`).join('')}</div>`);
      onAct(m.el, (act) => {
        const choice = choices[Number(act)];
        if (!choice) return;
        const outcome = choice.run(ctx);
        // A choice that turns into a fight or a chase: play it, then wrap up.
        if (outcome.fight || outcome.chase) {
          if (ev.weird) this.earn('weird', 3, 'weird');
          const lead = applyOutcome(this.state, outcome);
          m.close();
          void (async () => {
            if (outcome.fight) {
              toast(lead, { icon: ev.emoji, ms: 2500 });
              await this.runFight(outcome.fight.foe, outcome.fight.emoji, outcome.fight.power, `${ev.emoji} ${ev.title}`);
            } else if (outcome.chase) {
              const c = outcome.chase;
              markChase(this.state);
              const got = await this.runChase(c.heat, lead);
              if (!got) await this.resultCard('🚔', 'Caught', arrest(this.state, c.reason, c.hours, c.bail));
            }
            this.save();
            this.refreshHud(true);
            resolve();
          })();
          return;
        }
        if (ev.weird) this.earn('weird', 3, 'weird');
        const before = this.state.money;
        const text = applyOutcome(this.state, outcome);
        const delta = this.state.money - before;
        if (outcome.tone === 'bad') sfx.bad();
        const flags = ev.redFlags && (outcome.scam || ev.kind === 'scam') ? `<div class="flags"><b>🚩 Red flags</b><ul>${ev.redFlags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : '';
        const lesson = outcome.lesson ? `<div class="lesson">💡 ${esc(outcome.lesson)}</div>` : '';
        const scamNote = outcome.scam === 'spotted' ? '<p style="color:var(--good);font-weight:700;margin-top:-6px">🧠 Scam spotted! Street Smarts up.</p>' : outcome.scam === 'fell' ? '<p style="color:var(--bad);font-weight:700;margin-top:-6px">😬 You got scammed.</p>' : '';
        m.el.innerHTML = `<div class="big">${outcome.tone === 'good' ? '😄' : outcome.tone === 'bad' ? '😖' : '🤷'}</div><h2>${esc(ev.title)}</h2><p>${esc(text)}${delta ? ` <b>${money(delta, { sign: true })}</b>` : ''}</p>${scamNote}${flags}${lesson}<button class="btn primary block" data-act="ok">OK</button>`;
        onAct(m.el, (a2) => {
          if (a2 !== 'ok') return;
          m.close();
          this.save();
          this.refreshHud(true);
          resolve();
        });
      });
    });
  }

  // ===================================================================
  // Overlays, HUD, saving
  // ===================================================================

  private openPhoneApp(app?: string): void {
    if (this.overlayClose) return;
    const close = openPhone(
      {
        state: this.state,
        rideQuote: (id, lux) => this.rideQuote(id, lux),
        moveHome: (id) => (PLACE_BY_ID[id] ? this.moveHome(PLACE_BY_ID[id]) : 'No such home.'),
        playGame: (id) => {
          this.overlayClose = null;
          window.setTimeout(() => playArcade(this.funHost(), id, undefined, { phone: true }), 250);
        },
        rideshare: (id, lux) => {
          this.overlayClose = null;
          this.rideshare(id, lux);
        },
        adStats: () => this.ads?.stats ?? { seconds: {}, views: {}, taps: {} },
        setQuality: (q) => {
          this.state.settings.quality = q;
          this.save();
          toast('Graphics change applies next time you load the game.', { icon: '⚙️' });
        },
        toggleMusic: () => {
          this.state.settings.music = this.state.settings.music === false;
          setAmbienceEnabled(this.state.settings.music !== false);
          music.setEnabled(this.state.settings.music !== false);
          this.save();
        },
        skipSong: () => music.skip(),
        setVolume: (kind: 'music' | 'sfx', v: number) => {
          if (kind === 'music') this.state.settings.musicVol = v;
          else this.state.settings.sfxVol = v;
          this.applySound();
        },
        toggleMute: (kind: 'music' | 'sfx') => {
          const st = this.state.settings;
          if (kind === 'music') st.music = st.music === false;
          else st.sound = !st.sound;
          this.applySound();
          this.save();
        },
        saveSettings: () => this.save(),
        nowPlaying: () => music.title,
        toggleSound: () => {
          this.state.settings.sound = !this.state.settings.sound;
          setSoundEnabled(this.state.settings.sound);
          if (!this.state.settings.sound) soundscape.silence();
          this.save();
        },
        resetLife: () => {
          deleteGame();
          location.reload();
        },
        save: () => this.save(),
        refresh: () => this.refreshHud(true),
        onTradeWin: (mult) => this.celebrateTrade(mult),
      },
      app,
    );
    // The phone removes itself when closed; poll lightly to clear our reference.
    this.overlayClose = close;
    const watch = window.setInterval(() => {
      if (!document.querySelector('.phone')) {
        window.clearInterval(watch);
        if (this.overlayClose === close) this.overlayClose = null;
      }
    }, 200);
  }

  private openAdCard(slotId: string): void {
    const ad = this.ads?.creativeFor(slotId);
    if (!ad) return;
    this.ads!.recordTap(ad.id);
    const sheet = openSheet({
      emoji: '📢',
      title: ad.brand,
      sub: 'Sponsored',
      body: `<div class="card" style="background:${ad.bg};color:${ad.fg}"><h3 style="color:${ad.fg}">${esc(ad.brand)}</h3><p style="color:${ad.fg};opacity:.85">${esc(ad.line)}</p></div><p class="fine">${ad.link ? `<a href="${ad.link}" target="_blank" rel="noopener noreferrer sponsored">Visit advertiser ↗</a>` : 'This is a placeholder ad for a made-up brand. Real advertisers can book this screen when advertising opens.'}</p>`,
    });
    void sheet;
  }

  /** InstaDash orders that have arrived go in the fridge. */
  private checkDeliveries(): void {
    if (!this.state.kitchen?.orders.length) return;
    if (!receiveOrders(this.state)) return;
    sfx.notify();
    toast(hasDoorman(this.state) ? 'The doorman took in your InstaDash bag. It’s in your fridge.' : 'InstaDash dropped off your groceries. They’re in your fridge.', { icon: '🛵', tone: 'good', ms: 4000 });
    this.save();
  }

  private refreshHud(force = false): void {
    if (!this.hud) return;
    const s = this.state;
    const inside = this.engine.mode === 'interior' && !!s.location.placeId;
    let where: { area: string; place?: string; streets?: string[] };
    if (inside) where = { area: DISTRICTS[s.location.area].name, place: PLACE_BY_ID[s.location.placeId!].name };
    else if (this.engine.mode === 'transit') where = { area: 'Subway', place: 'On the train' };
    else where = { area: DISTRICTS[s.location.area].name, streets: crossStreets(DISTRICTS[s.location.area], this.player.root.position.x, this.player.root.position.z).split(' & ') };
    const blocker = s.job ? shiftBlocker(s) : 'none';
    const goal = currentGoal(s);
    this.hud.update(s, where, {
      inside,
      atHome: inside && !!this.interior && 'removePiece' in this.interior && (this.interior as HomeInterior).movable,
      canWork: !this.busy && (!s.job || !blocker),
      workLabel: !s.job ? 'Find a job' : s.location.placeId === CAREER_BY_ID[s.job.careerId].placeId ? `Work a shift · up to ${money(payBand(s).max)}` : `Go to work · up to ${money(payBand(s).max)}`,
      goal: goal ? { title: goal.title, hint: hintLevel(s) === 'off' ? '' : goal.hint } : null,
    });
    void force;
    syncJail(s, () => {
      this.save();
      this.refreshHud();
    });
  }

  /** Turn to face someone and open their sheet. */
  private talkTo(personId: string): void {
    const at = this.crowd?.where(personId);
    if (at) this.player.root.rotation.y = Math.atan2(at.x - this.player.root.position.x, at.z - this.player.root.position.z);
    openPerson(this.peopleHost(), personId);
  }

  private _peopleHost: PeopleHost | null = null;
  /** What the people screens (ui/people-ui.ts) need from the game. */
  private peopleHost(): PeopleHost {
    if (this._peopleHost) return this._peopleHost;
    this._peopleHost = {
      fight: (foe, emoji, power) => this.runFight(foe, emoji, power),
      state: this.state,
      area: () => this.state.location.area,
      where: (id) => this.crowd?.where(id) ?? null,
      player: () => ({ x: this.player.root.position.x, z: this.player.root.position.z }),
      nearby: (x, z, r) => this.crowd?.nearby(x, z, r) ?? [],
      hold: (id, sec) => this.crowd?.hold(id, sec, this.player.root.position.x, this.player.root.position.z),
      approach: (id) => this.crowd?.approach(id, this.player.root.position.x, this.player.root.position.z),
      goTo: (placeId, label, then) => this.teleport(placeId, label, then),
      goHome: (then) => this.teleport(this.state.home.placeId, '🌙 Heading home together…', then),
      save: () => this.save(),
      refresh: () => this.refreshHud(true),
      sfx: (k) => (k === 'good' ? sfx.notify() : k === 'bad' ? sfx.bad() : sfx.tap()),
    };
    Object.defineProperty(this._peopleHost, 'state', { get: () => this.state });
    return this._peopleHost;
  }

  /** Fade over to a place's door (free), then run `then`. Used for dates. */
  private teleport(placeId: string, label: string, then: () => void): void {
    const place = PLACE_BY_ID[placeId];
    if (!place || this.busy) return;
    this.busy = true;
    closeSheet();
    fade(true, label, place.name);
    window.setTimeout(() => {
      if (this.engine.mode === 'interior') {
        this.interior?.dispose();
        this.interior = null;
        this.engine.cityScene.add(this.player.root);
        this.setMode('city');
        this.engine.altScene = null;
      }
      if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
      const d = doorOf(place);
      this.state.location = { area: place.area, placeId: null, x: d.x, z: d.z };
      this.placePlayerAtLocation();
      fade(false);
      this.busy = false;
      this.save();
      then();
    }, 1600);
  }

  /** Someone with a grudge spots you and comes over. */
  private confrontCooldown = 0;
  private maybeConfrontation(): void {
    if (!this.crowd || this.busy || this.overlayClose || isSheetOpen() || this.engine.mode !== 'city' || this.state.jail) return;
    if (performance.now() < this.confrontCooldown) return;
    const p = this.player.root.position;
    for (const n of this.crowd.nearby(p.x, p.z, 14)) {
      const m = this.state.people[n.personId];
      if (!m || m.grudge < 45) continue;
      if (m.lastConfront && nowMs() - m.lastConfront < 10 * 60_000) continue;
      const who = personOf(n.personId);
      if (who.temper === 'cool' && who.warmth !== 'mean') continue;
      if (Math.random() > 0.45) continue;
      this.confrontCooldown = performance.now() + 90_000;
      this.crowd.approach(n.personId, p.x, p.z);
      window.setTimeout(() => confront(this.peopleHost(), n.personId), 1500);
      return;
    }
  }

  /** Your own car, drawn where you are while you drive (sim/garage.ts). */
  private carMesh: THREE.Mesh | null = null;
  private carKey = '';
  private syncCar(): void {
    const car = this.state ? drivingCar(this.state) : null;
    const key = car ? `${car.model}|${car.paint}` : '';
    if (key !== this.carKey) {
      if (this.carMesh) this.carMesh.removeFromParent();
      this.carMesh = null;
      this.carKey = key;
      const v = car ? VEHICLES.get(car.model) : undefined;
      if (v && car) {
        this.carMesh = new THREE.Mesh(vehicleGeometry(v, car.paint), vehicleMaterial());
        this.carMesh.name = 'my-car';
        this.engine.cityScene.add(this.carMesh);
      }
    }
    this.player.root.visible = !this.carMesh || this.engine.mode !== 'city';
    if (this.carMesh) {
      this.carMesh.position.set(this.player.root.position.x, 0, this.player.root.position.z);
      this.carMesh.rotation.y = this.player.root.rotation.y;
    }
  }

  /** Drive your own car to a place. floorIt = speeding (faster, fun, risky). */
  private driveTo(placeId: string, floorIt: boolean): void {
    if (this.busy) return;
    if (PLACE_BY_ID[placeId] && !isOpenArea(PLACE_BY_ID[placeId].area)) return void toast('That’s outside Manhattan — not open yet.', { icon: '🚧' });
    const s = this.state;
    const place = PLACE_BY_ID[placeId];
    if (!s.garage.driving) s.garage.driving = s.garage.cars[0]?.uid ?? null;
    const car = drivingCar(s);
    if (!car) return toast('You don’t own a car. Phone → Cars.', { icon: '🚗', tone: 'bad' });
    const t = nycTime();
    const r = driveTrip(s, floorIt, weatherFor(t.dateKey, t.hour));
    closeSheet();
    if (r.stopped) {
      sfx.bad();
      for (const line of r.lines) toast(line, { tone: 'bad', ms: 5500 });
      this.save();
      this.refreshHud(true);
      return;
    }
    this.busy = true;
    const v = VEHICLES.get(car.model);
    fade(true, floorIt ? '🏎️ Flooring it…' : `🚗 Driving your ${v?.name ?? 'car'}`, `To ${place.name}${place.area !== s.location.area ? ' — over the bridge' : ''}`, nextTravelAd());
    window.setTimeout(() => {
      if (this.engine.mode === 'interior') {
        this.interior?.dispose();
        this.interior = null;
        this.engine.cityScene.add(this.player.root);
        this.setMode('city');
        this.engine.altScene = null;
      }
      if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
      const d = doorOf(place);
      this.state.location = { area: place.area, placeId: null, x: d.x, z: d.z };
      this.placePlayerAtLocation();
      fade(false);
      this.busy = false;
      for (const line of r.lines) toast(line, { tone: r.tone, ms: 5000 });
      this.save();
      window.setTimeout(() => this.openPlace(place), 400);
    }, floorIt ? 1500 : 2000); // long enough to see the ad on the loading screen
  }

  // ===================================================================
  // 🌐 Online (net/online.ts, ui/online-app.ts): only when a server is set.
  // ===================================================================
  private online: Online | null = null;
  private netChip: HTMLButtonElement | null = null;

  private startOnline(): void {
    const o = new Online({
      state: () => this.state,
      cityScene: () => (this.engine.mode === 'city' ? this.engine.cityScene : null),
      me: () => {
        const s = this.state;
        const city = this.engine.mode === 'city';
        const p = this.player.root.position;
        return { area: s.location.area, x: city ? p.x : s.location.x, z: city ? p.z : s.location.z, ry: this.player.root.rotation.y, moving: city && this.path.length > 0, placeId: city ? null : s.location.placeId };
      },
      saved: () => {
        this.save();
        this.refreshHud(true);
      },
      toast: (text, opts) => toast(text, opts),
      choose: (title, text, options) =>
        new Promise((resolve) => {
          const m = openModal(`<div class="big">☁️</div><h2>${esc(title)}</h2><p style="white-space:pre-line">${esc(text)}</p><div class="choices">${options.map((x) => `<button class="choice" data-act="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div>`);
          onAct(m.el, (act) => {
            m.close();
            resolve(act);
          });
        }),
    });
    this.online = o;
    setOnline(o);
    if (!o.available) return;
    void o.boot().then((open) => {
      if (open === 'reset') this.openPhoneApp('online');
    });
    // 💬 Street chip: other players nearby, emotes and chat.
    const chip = document.createElement('button');
    chip.className = 'net-chip';
    chip.hidden = true;
    chip.setAttribute('aria-label', 'Online players nearby: wave or chat');
    chip.addEventListener('click', () => {
      sfx.tap();
      openChat(o);
    });
    document.getElementById('ui')?.appendChild(chip);
    this.netChip = chip;
  }

  private save(): void {
    if (!this.state) return;
    this.state.lastTick = Math.max(this.state.lastTick, nowMs() - 1000);
    saveGame(this.state);
  }
}

function fmtH(h: number): string {
  if (h === 24 || h === 0) return '12AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'AM' : 'PM'}`;
}
