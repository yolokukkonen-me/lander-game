// Version for cache busting on mobile devices
var igeVersion = '20251102001';

var igeClientConfig = {
	include: [
		/* Your custom game JS scripts */
		'./gameClasses/ClientNetworkEvents.js?v=' + igeVersion,
		'./gameClasses/ClientWorld.js?v=' + igeVersion,
		'./gameClasses/ClientTerrain.js?v=' + igeVersion,
		'./gameClasses/Orb.js?v=' + igeVersion,
		'./gameClasses/OrbPointer.js?v=' + igeVersion,
		'./gameClasses/Player.js?v=' + igeVersion,
		'./gameClasses/BotPlayer.js?v=' + igeVersion,
		'./gameClasses/SimpleBotPlayer.js?v=' + igeVersion,
		'./gameClasses/PlayerBehaviour.js?v=' + igeVersion,
		'./gameClasses/PlayerStatsUI.js?v=' + igeVersion,
		'./gameClasses/ThrustParticle.js?v=' + igeVersion,
		'./gameClasses/ExplosionParticle.js?v=' + igeVersion,
		'./gameClasses/LandingPad.js?v=' + igeVersion,
		'./gameClasses/ClientCountDown.js?v=' + igeVersion,
		'./gameClasses/ClientScore.js?v=' + igeVersion,
		/* Standard game scripts */
		'./client.js?v=' + igeVersion,
		'./index.js?v=' + igeVersion
	]
};

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = igeClientConfig; }