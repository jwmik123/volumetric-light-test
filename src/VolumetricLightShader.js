// Three.js Transpiler r180

import { uniform, texture, Fn, vec4, If, dot, length, cos, sin, vec2, max, min, float, add, mul, sub, pow, exp, int, vec3, normalize, radians, Break, Continue, smoothstep, Loop } from 'three/tsl';

const projectionMatrixInverse = uniform( 'mat4' );
const lightDirection = uniform( 'vec3' );
const lightPosition = uniform( 'vec3' );
const viewMatrixInverse = uniform( 'mat4' );
const cameraPosition = uniform( 'vec3' );
const cameraFar = uniform( 'float' );
const coneAngle = uniform( 'float' );
const shadowMap = texture( /* <THREE.Texture> */ );
const lightViewMatrix = uniform( 'mat4' );
const lightProjectionMatrix = uniform( 'mat4' );
const shadowBias = uniform( 'float' );
const depthBuffer = texture( /* <THREE.Texture> */ );

export const readDepth = /*@__PURE__*/ Fn( ( [ depthSampler, coord ] ) => {

	return depthSampler.sample( coord ).x;

}, { depthSampler: 'sampler2D', coord: 'vec2', return: 'float' } );

export const getWorldPosition = /*@__PURE__*/ Fn( ( [ uv, depth ] ) => {

	const clipZ = depth.mul( 2.0 ).sub( 1.0 );
	const ndc = uv.mul( 2.0 ).sub( 1.0 );
	const clip = vec4( ndc, clipZ, 1.0 );
	const view = projectionMatrixInverse.mul( clip );
	const world = viewMatrixInverse.mul( view );

	return world.xyz.div( world.w );

}, { uv: 'vec2', depth: 'float', return: 'vec3' } );

export const calculateShadow = /*@__PURE__*/ Fn( ( [ worldPosition ] ) => {

	const lightClipPos = lightProjectionMatrix.mul( lightViewMatrix ).mul( vec4( worldPosition, 1.0 ) );
	const lightNDC = lightClipPos.xyz.div( lightClipPos.w );
	const shadowCoord = lightNDC.xy.mul( 0.5 ).add( 0.5 );
	const lightDepth = lightNDC.z.mul( 0.5 ).add( 0.5 );

	If( shadowCoord.x.lessThan( 0.0 ).or( shadowCoord.x.greaterThan( 1.0 ) ).or( shadowCoord.y.lessThan( 0.0 ) ).or( shadowCoord.y.greaterThan( 1.0 ) ).or( lightDepth.greaterThan( 1.0 ) ), () => {

		return 1.0;

	} );

	const shadowMapDepth = shadowMap.sample( shadowCoord ).x;

	If( lightDepth.greaterThan( shadowMapDepth.add( shadowBias ) ), () => {

		return 0.0;

	} );

	return 1.0;

}, { worldPosition: 'vec3', return: 'float' } );

export const sdCone = /*@__PURE__*/ Fn( ( [ p, axisOrigin, axisDir, angleRad ] ) => {

	const p_to_origin = p.sub( axisOrigin );
	const h = dot( p_to_origin, axisDir );

	// Height along axis

	const r = length( p_to_origin.sub( axisDir.mul( h ) ) );

	// Radius at height h

	const c = cos( angleRad );
	const s = sin( angleRad );
	const q = vec2( r, h );

	// Calculates distance based on height/radius and cone angle

	const distToSurfaceLine = r.mul( c ).sub( h.mul( s ) );
	const distToApexPlane = h.negate();

	If( h.lessThan( 0.0 ).and( distToSurfaceLine.greaterThan( 0.0 ) ), () => {

		return length( p_to_origin );

	} );

	const boundaryDists = vec2( distToSurfaceLine, distToApexPlane );

	return length( max( boundaryDists, 0.0 ) ).add( min( max( boundaryDists.x, boundaryDists.y ), 0.0 ) );

}, { p: 'vec3', axisOrigin: 'vec3', axisDir: 'vec3', angleRad: 'float', return: 'float' } );

const SCATTERING_ANISO = float( 0.5 );

export const HGPhase = /*@__PURE__*/ Fn( ( [ mu ] ) => {

	const g = SCATTERING_ANISO;
	const gg = g.mul( g );
	const denom = add( 1.0, gg ).sub( mul( 2.0, g ).mul( mu ) );
	denom.assign( max( denom, 0.0001 ) );
	const scatter = sub( 1.0, gg ).div( pow( denom, 1.5 ) );

	return scatter;

}, { mu: 'float', return: 'float' } );

export const BeersLaw = /*@__PURE__*/ Fn( ( [ dist, absorption ] ) => {

	return exp( dist.negate().mul( absorption ) );

}, { dist: 'float', absorption: 'float', return: 'float' } );

const STEP_SIZE = float( 0.05 );
const NUM_STEPS = int( 250 );
const lightColor = vec3( 0.2 );
const LIGHT_INTENSITY = float( 3.5 );
const FOG_DENSITY = float( 0.05 );

export const mainImage = /*@__PURE__*/ Fn( ( [ inputColor, uv, outputColor_immutable ] ) => {

	const outputColor = outputColor_immutable;
	const depth = readDepth( depthBuffer, uv );
	const worldPosition = getWorldPosition( uv, depth );
	const rayOrigin = cameraPosition;
	const rayDir = normalize( worldPosition.sub( rayOrigin ) );
	const sceneDepth = length( worldPosition.sub( cameraPosition ) );
	const lightPos = lightPosition;
	const lightDir = normalize( lightDirection );
	const coneAngleRad = radians( coneAngle );
	const halfConeAngleRad = coneAngleRad.mul( 0.5 );
	const smoothEdgeWidth = float( 0.1 );
	const t = STEP_SIZE;
	const transmittance = float( 5.0 );
	const accumulatedLight = vec3( 0.0 );

	Loop( { start: 0, end: NUM_STEPS }, ( { i } ) => {

		const samplePos = rayOrigin.add( rayDir.mul( t ) );

		If( t.greaterThan( sceneDepth ).or( t.greaterThan( cameraFar ) ), () => {

			Break();

		} );

		const shadowFactor = calculateShadow( samplePos );

		If( shadowFactor.equal( 0.0 ), () => {

			t.addAssign( STEP_SIZE );
			Continue();

		} );

		const sdfVal = sdCone( samplePos, lightPos, lightDir, halfConeAngleRad );
		const shapeFactor = smoothstep( 0.0, smoothEdgeWidth.negate(), sdfVal );

		If( shapeFactor.lessThan( 0.1 ), () => {

			t.addAssign( STEP_SIZE );
			Continue();

		} );

		const distanceToLight = length( samplePos.sub( lightPos ) );
		const sampleLightDir = normalize( samplePos.sub( lightPos ) );
		const attenuation = exp( - 0.3.mul( distanceToLight ) );
		const scatterPhase = HGPhase( dot( rayDir, sampleLightDir.negate() ) );
		const luminance = lightColor.mul( LIGHT_INTENSITY ).mul( attenuation ).mul( scatterPhase );
		const stepDensity = FOG_DENSITY.mul( shapeFactor );
		stepDensity.assign( max( stepDensity, 0.0 ) );
		const stepTransmittance = BeersLaw( stepDensity.mul( STEP_SIZE ), 1.0 );
		transmittance.mulAssign( stepTransmittance );
		accumulatedLight.addAssign( luminance.mul( transmittance ).mul( stepDensity ).mul( STEP_SIZE ) );
		t.addAssign( STEP_SIZE );

	} );

	const volumetricLight = accumulatedLight;
	const finalColor = inputColor.rgb.add( volumetricLight );
	outputColor.assign( vec4( finalColor, 1.0 ) );

} );
