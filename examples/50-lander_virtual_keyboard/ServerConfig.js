var igeConfig = {
	include: [
		{name: 'ServerNetworkEvents', path: './gameClasses/ServerNetworkEvents'},
		{name: 'ServerTerrain', path: './gameClasses/ServerTerrain'},
		{name: 'Player', path: './gameClasses/Player'},
		{name: 'BotPlayer', path: './gameClasses/BotPlayer'},
		{name: 'Orb', path: './gameClasses/Orb'},
		{name: 'LandingPad', path: './gameClasses/LandingPad'}
	]
};

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = igeConfig; }