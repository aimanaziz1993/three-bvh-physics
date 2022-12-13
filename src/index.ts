import './style.css';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { OrbitControls } from 'three-stdlib';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import { MeshBVH, MeshBVHVisualizer } from 'three-mesh-bvh';

import Stats from 'three/examples/jsm/libs/stats.module'
import { GUI } from 'dat.gui';

const params = {
    firstPerson: false,

    displayCollider: false,
	displayBVH: false,
	displayParents: false,
	visualizeDepth: 15,
	gravity: - 9.8,
    playerSpeed: 5,
	physicsSteps: 5,

    reset: resetPlayer
}

let renderer: THREE.WebGLRenderer, 
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls, 
    scene: THREE.Scene, 
    clock: THREE.Clock, 
    gui: GUI, 
    stats: Stats;
let environment: THREE.Group, 
    collider: any, 
    visualizer: any;
let player: THREE.Mesh;
let playerIsOnGround = false;

let playerVelocity = new THREE.Vector3();

init();
render();

function init() {
    // GUI
    gui = new GUI();

    const bgColor = 0x263238 / 2;

    // renderer
    renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setClearColor( bgColor, 1 );
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputEncoding = THREE.sRGBEncoding;
	document.body.appendChild( renderer.domElement );

    // scene setup
	scene = new THREE.Scene();
	scene.fog = new THREE.Fog( bgColor, 20, 70 );

    // lights
    const light = new THREE.DirectionalLight( 0xffffff, 0.5 );
	light.position.set( 1, 1, 1 );
	scene.add( light );
	scene.add( new THREE.AmbientLight( 0xffffff, 0.4 ) );

    // camera setup
	camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 50 );
	camera.position.set( 0, 0, -2 );
	// camera.position.set( 0, 8, - 5 );
	camera.far = 100;
	camera.updateProjectionMatrix();
    console.log(window);
	// window.camera = camera;

    const cameraFolder = gui.addFolder( 'Camera Settings' );
    cameraFolder.add( camera.position, 'x', -1, 10, 1);
    cameraFolder.add( camera.position, 'y', -1, 10, 1);
    cameraFolder.add( camera.position, 'z', -10, 10, 1);

    clock = new THREE.Clock();

	controls = new OrbitControls( camera, renderer.domElement );
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance = 1;
	controls.maxDistance = 10;
    controls.setPolarAngle(0.9);
    console.log(controls);

	// stats setup
	stats = Stats();
	document.body.appendChild( stats.dom );

    // Static World
    loadStaticModelCollider();

    // Character
    initPlayer();

    // GUI - Player Physics Settings
    const physicsFolder = gui.addFolder( 'Player Physics Settings' );
	physicsFolder.add( params, 'physicsSteps', 0, 30, 1 );
	physicsFolder.add( params, 'gravity', - 100, 100, 0.01 ).onChange( v => {

		params.gravity = parseFloat( v );

	} );
	physicsFolder.add( params, 'playerSpeed', 1, 20 );

    // GUI - Visualization
    const visFolder = gui.addFolder( 'Visualization' );
	visFolder.add( params, 'displayCollider' );
	visFolder.add( params, 'displayBVH' );
	visFolder.add( params, 'displayParents' ).onChange( v => {

		visualizer.displayParents = v;
		visualizer.update();

	} );
	visFolder.add( params, 'visualizeDepth', 1, 20, 1 ).onChange( v => {

		visualizer.depth = v;
		visualizer.update();

	} );
	visFolder.close();

    // resize window listener
    window.addEventListener( 'resize', function () {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );

	}, false );
}

function loadStaticModelCollider() {

    new GLTFLoader().load('models/JAPANESE VILLAGE.glb', function (model) {

        environment = model.scene;
        environment.scale.setScalar( 0.2 );
        environment.position.set(0, -4, 0)

        // Traverse all children & pushed to a new array called geometry
        const geometries: any = [];
        environment.updateMatrixWorld( true );
        environment.traverse((c: any) => {

            if ( c.name === 'G-Portal_0' ) {
                var center = new THREE.Vector3();
                var geometry = c.geometry;

                geometry.computeBoundingBox();
                geometry.boundingBox.getCenter( center );
                c.localToWorld( center )
            }

            if ( c.geometry ) {
                
                // To prepare the geometry for replication of physics collider
                const cloned = c.geometry.clone();
                // console.log(cloned);
                cloned.applyMatrix4( c.matrixWorld )
                for ( const key in cloned.attributes ) {

                    // why remove attribute other than position?? - To wrap only geometry float32 array of position only into physics collider
                    if ( key !== 'position' ) {
                        cloned.deleteAttribute( key );
                    }
                }

                geometries.push( cloned );
            }
        });

        // Now after we get geometries buffer array, we will include it in buffergeometryutils as merged buffer - So that it will wrap everything as only one buffer geom
        const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries( geometries );
        mergedGeometry.boundsTree = new MeshBVH( mergedGeometry );
        // console.log(mergedGeometry);

        // include mergedGeometry as collider using THREE.Mesh
        collider = new THREE.Mesh( mergedGeometry );
        collider.material.wireframe = true;
		collider.material.opacity = 0.5;
		collider.material.transparent = true;

        // Wrap a visualizer from thee-mesh-bvh as the collider visual for debugging
        visualizer = new MeshBVHVisualizer( collider, params.visualizeDepth );

        // add everything into scene - world, visual & collider
        scene.add( visualizer );
        scene.add( collider );
        scene.add( environment );

        environment.traverse(( c:any ) => {

            if ( c.material ) {
                c.castShadow = true;
				c.receiveShadow = true;
				c.material.shadowSide = 2;
            }
        });

        const environmentFolder = gui.addFolder( 'Environment Settings' );
        environmentFolder.add( environment.position, 'x', -10, 10, 1);
        environmentFolder.add( environment.position, 'y', -10, 10, 1);
        environmentFolder.add( environment.position, 'z', -10, 10, 1);
    });
}


function initPlayer() {

    // setTimeout(() => {
        player = new THREE.Mesh(
            new RoundedBoxGeometry( 1.0, 2.0, 1.0, 10, 0.5 ),
            new THREE.MeshStandardMaterial()
        )
        player.scale.setScalar( 0.2 )
        player.geometry.translate( 0, 1.5, 0 );
        player.userData.capsuleInfo = {
            radius: 0.5,
            segment: new THREE.Line3( new THREE.Vector3(), new THREE.Vector3( 0, - 1.0, 0.0 ) )
        };
        player.castShadow = true;
        player.receiveShadow = true;
        // player.material.shadowSide = 2;

        console.log(player);
        scene.add( player )
        resetPlayer();

        const playerFolder = gui.addFolder( 'Player Settings' );
        playerFolder.add( player.position, 'x', -1, 2, 0.1);
        playerFolder.add( player.position, 'y', -1, 2, 0.1);
        playerFolder.add( player.position, 'z', -1, 2, 0.1);
        gui.add( params, 'reset' );

    // }, 1500)

    
}

function resetPlayer() {
    playerVelocity.set( 0, 0, 0 );
	player.position.set( 0.9, - 0.5, -0.5 );
	camera.position.sub( controls.target );
	controls.target.copy( player.position );
	camera.position.add( player.position );
    camera.updateProjectionMatrix();
	controls.update();
}

function updatePlayer( delta: any ) {

    // Add player velocity when not on ground
    // playerVelocity.y += playerIsOnGround ? 0 : delta * params.gravity;
    // // Change constantly the player y axis position according to gravity
    // player.position.addScaledVector( playerVelocity, delta )
    // console.log(player);

    // player.updateMatrixWorld();



    // // if the player has fallen too far below the level reset their position to the start
	// if ( player.position.y < - 40 ) {

	// 	resetPlayer();

	// }
}

function render() {

    stats.update();
    requestAnimationFrame( render );

    const delta = Math.min( clock.getDelta(), 0.1 );

    if ( collider ) {
        collider.visible = params.displayCollider;
		visualizer.visible = params.displayBVH;

        const physicsSteps = params.physicsSteps;

		for ( let i = 0; i < physicsSteps; i ++ ) {

			updatePlayer( delta / physicsSteps );

		}
    }

    controls.update();

    renderer.render( scene, camera );
}
