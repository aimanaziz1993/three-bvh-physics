import './style.css';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// import { OrbitControls } from 'three-stdlib';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import { MeshBVH, MeshBVHVisualizer } from 'three-mesh-bvh';

import Stats from 'three/examples/jsm/libs/stats.module'
import { GUI } from 'dat.gui';

const params = {
    firstPerson: false,

    displayCollider: false,
	displayBVH: false,
	displayParents: false,
	visualizeDepth: 10,
	gravity: - 9.81,
    playerSpeed: 3,
	physicsSteps: 5,

    reset: resetPlayer,

    // gravity
    Earth: true,
    Moon: false,
    Jupiter: false,
    Sun: false,
    Mars: false
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

let upVector = new THREE.Vector3( 0, 1, 0 );
let tempVector = new THREE.Vector3();
let tempVector2 = new THREE.Vector3();
let tempBox = new THREE.Box3();
let tempMat = new THREE.Matrix4();
let tempSegment = new THREE.Line3();

let forward: boolean = false;
let back: boolean = false;
let right: boolean = false;
let left: boolean = false;

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
	// window.camera = camera;

    const cameraFolder = gui.addFolder( 'Camera Settings' );
    cameraFolder.add( camera.position, 'x', -1, 10, 1);
    cameraFolder.add( camera.position, 'y', -1, 10, 1);
    cameraFolder.add( camera.position, 'z', -10, 10, 1);

    clock = new THREE.Clock();

	controls = new OrbitControls( camera, renderer.domElement );

	// stats setup
	stats = Stats();
	document.body.appendChild( stats.dom );

    // Static World
    loadStaticModelCollider();

    // Character
    initPlayer();

    // GUI - Player Settings
    if (player) {
        const playerFolder = gui.addFolder( 'Player Settings' );
        playerFolder.add( player.position, 'x', -20, 20, 1);
        playerFolder.add( player.position, 'y', -20, 20, 1);
        playerFolder.add( player.position, 'z', -20, 20, 1);
        gui.add( params, 'reset' ).name("Reset Player Position [CLICK]");
    }

    // GUI - Player Physics Settings
    const physicsFolder = gui.addFolder( 'Player Physics Settings' );
	physicsFolder.add( params, 'physicsSteps', 0, 30, 1 );
	physicsFolder.add( params, 'gravity', - 100, 100, 0.01 ).onChange( v => {

		params.gravity = parseFloat( v );

	} );
	physicsFolder.add( params, 'playerSpeed', 1, 20 );

    gui.add( params, 'Earth' )

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

    gui.add( params, 'firstPerson' ).onChange( v => {
		if ( ! v ) {
			camera
				.position
				.sub( controls.target )
				.normalize()
				.multiplyScalar( 10 )
				.add( controls.target );
		}
	} );

    // resize window listener
    window.addEventListener( 'resize', function () {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );

	}, false );

    // keyup, keydown event listener
    window.addEventListener('keydown', function(e) {
        switch ( e.code ) {
            case 'KeyW':
                forward = true;
                break;
            case 'KeyS':
                back = true;
                break;
            case 'KeyD':
                right = true;
            break;
            case 'KeyA':
                left = true;
                break;
            case 'Space':
                if ( playerIsOnGround ) {

					playerVelocity.y = 5.0;

				}
                break;
            default:
                break;
        }
    });

    window.addEventListener( 'keyup', function ( e ) {
		switch ( e.code ) {
			case 'KeyW': forward = false; break;
			case 'KeyS': back = false; break;
			case 'KeyD': right = false; break;
			case 'KeyA': left = false; break;
		}
	} );
}

function loadStaticModelCollider() {

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader( dracoLoader );

    loader.load('models/japan_self-defense_forces_military_base_kit.glb', function (model) {

        environment = model.scene;
        environment.scale.setScalar( .01 );
        environment.position.set(-15, -7, -16)

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

        console.log(environment);

        const environmentFolder = gui.addFolder( 'Environment Settings' );
        environmentFolder.add( environment.position, 'x', -30, 40, 1);
        environmentFolder.add( environment.position, 'y', -30, 40, 1);
        environmentFolder.add( environment.position, 'z', -30, 40, 1);
    });
}

function initPlayer() {

    player = new THREE.Mesh(
        new RoundedBoxGeometry( 1.0, 2.0, 1.0, 10, 0.5 ),
        new THREE.MeshStandardMaterial()
    );
    player.scale.setScalar( 0.5 )
    player.geometry.translate( 0, - 0.5, 0 );
    player.userData.capsuleInfo = {
        radius: 0.3,
        segment: new THREE.Line3( new THREE.Vector3(), new THREE.Vector3( 0, - 1.0, 0.0 ) )
    };
    // let shadowSide: THREE.Side;
    player.castShadow = true;
    player.receiveShadow = true;
    // player.material.shadowSide = 2;
    scene.add( player );

    // create custom material from the shader code above
	//   that is within specially labeled script tags
	// var customMaterial = new THREE.ShaderMaterial( 
    //     {
    //         uniforms: 
    //         { 
    //             "c":   { value: 1.0 },
    //             "p":   { value: 1.4 },
    //             glowColor: { value: new THREE.Color(0xffff00) },
    //             viewVector: { value: camera.position }
    //         },
    //         vertexShader:   document.getElementById( 'vertexShader'   ).textContent,
    //         fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
    //         side: THREE.FrontSide,
    //         blending: THREE.AdditiveBlending,
    //         transparent: true
    //     }   );
    // const playerGlow = new THREE.Mesh( player.geometry.clone(), customMaterial.clone() );
    // // playerGlow.position = player.position
    // playerGlow.scale.setScalar( 0.1 )
    // playerGlow.geometry.translate( 0, - 0.5, 0 );
    // playerGlow.scale.multiplyScalar(1.2)
    // scene.add(playerGlow);
    // console.log(playerGlow);
    

    setTimeout(() => {
        resetPlayer();
    }, 500);
    
}

function resetPlayer() {
    playerVelocity.set( 0, 0, 0 );
	player.position.set( 0, 0.5, 0 );
	camera.position.sub( controls.target );
	controls.target.copy( player.position );
	camera.position.add( player.position );
    camera.updateProjectionMatrix();
	controls.update();
}

function updatePlayer( delta: any ) {
    playerVelocity.y += playerIsOnGround ? 0 : delta * params.gravity;
	player.position.addScaledVector( playerVelocity, delta );

	// move the player
	const angle = controls.getAzimuthalAngle();
	if ( forward ) {

		tempVector.set( 0, 0, - 1 ).applyAxisAngle( upVector, angle );
		player.position.addScaledVector( tempVector, params.playerSpeed * delta );

	}

	if ( back ) {

		tempVector.set( 0, 0, 1 ).applyAxisAngle( upVector, angle );
		player.position.addScaledVector( tempVector, params.playerSpeed * delta );

	}

	if ( left ) {

		tempVector.set( - 1, 0, 0 ).applyAxisAngle( upVector, angle );
		player.position.addScaledVector( tempVector, params.playerSpeed * delta );

	}

	if ( right ) {

		tempVector.set( 1, 0, 0 ).applyAxisAngle( upVector, angle );
		player.position.addScaledVector( tempVector, params.playerSpeed * delta );

	}

	player.updateMatrixWorld();

	// adjust player position based on collisions
	const capsuleInfo = player.userData.capsuleInfo;
	tempBox.makeEmpty();
	tempMat.copy( collider.matrixWorld ).invert();
	tempSegment.copy( capsuleInfo.segment );

	// get the position of the capsule in the local space of the collider
	tempSegment.start.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );
	tempSegment.end.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );

	// get the axis aligned bounding box of the capsule
	tempBox.expandByPoint( tempSegment.start );
	tempBox.expandByPoint( tempSegment.end );

	tempBox.min.addScalar( - capsuleInfo.radius );
	tempBox.max.addScalar( capsuleInfo.radius );

	collider.geometry.boundsTree.shapecast( {

		intersectsBounds: (box: any) => box.intersectsBox( tempBox ),

		intersectsTriangle: (tri: any) => {

			// check if the triangle is intersecting the capsule and adjust the
			// capsule position if it is.
			const triPoint = tempVector;
			const capsulePoint = tempVector2;

			const distance = tri.closestPointToSegment( tempSegment, triPoint, capsulePoint );

			if ( distance < capsuleInfo.radius ) {

				const depth = capsuleInfo.radius - distance;
				const direction = capsulePoint.sub( triPoint ).normalize();

				tempSegment.start.addScaledVector( direction, depth );
				tempSegment.end.addScaledVector( direction, depth );
			}
		}

	} );

	// get the adjusted position of the capsule collider in world space after checking
	// triangle collisions and moving it. capsuleInfo.segment.start is assumed to be
	// the origin of the player model.
	const newPosition = tempVector;
	newPosition.copy( tempSegment.start ).applyMatrix4( collider.matrixWorld );

	// check how much the collider was moved
	const deltaVector = tempVector2;
	deltaVector.subVectors( newPosition, player.position );

	// if the player was primarily adjusted vertically we assume it's on something we should consider ground
	playerIsOnGround = deltaVector.y > Math.abs( delta * playerVelocity.y * 0.25 );

	const offset = Math.max( 0.0, deltaVector.length() - 1e-5 );
	deltaVector.normalize().multiplyScalar( offset );

	// adjust the player model
	player.position.add( deltaVector );

	if ( ! playerIsOnGround ) {

		deltaVector.normalize();
		playerVelocity.addScaledVector( deltaVector, - deltaVector.dot( playerVelocity ) );

	} else {

		playerVelocity.set( 0, 0, 0 );

	}

	// adjust the camera
    camera.position.sub( controls.target );
	controls.target.copy( player.position );
	camera.position.add( player.position );

	// if the player has fallen too far below the level reset their position to the start
	if ( player.position.y < - 25 ) {
		resetPlayer();
	}
}

function render() {
    stats.update();
    requestAnimationFrame( render );

    const delta = Math.min( clock.getDelta(), 0.1 );

    // controls.maxPolarAngle = Math.PI / 2;
    // controls.minDistance = 2;
    // controls.maxDistance = 5;

    if ( params.firstPerson ) {

		controls.maxPolarAngle = Math.PI;
		controls.minDistance = 1e-4;
		controls.maxDistance = 1e-4;

	} else {

		controls.maxPolarAngle = Math.PI / 2;
		controls.minDistance = 2;
		controls.maxDistance = 5;

	}

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
