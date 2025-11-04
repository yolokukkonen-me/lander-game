# Lander Game - ML Bot Training Project

Multiplayer space lander game with AI bot training infrastructure. Features segment-based training data collection, Behavioral Cloning, and PPO reinforcement learning.

---

## 🚀 Quick Start

### Local Development

```powershell
# Start local server
.\start-local.ps1

# Open browser
http://localhost/examples/50-lander_virtual_keyboard/
```

### Remote Server

```powershell
# Check status
.\status-local.ps1

# View logs
.\remote-logs.ps1

# SSH access
.\remote-ssh.ps1
```

See **[QUICK-START.md](QUICK-START.md)** for detailed setup instructions.

---

## 🎮 Game Features

- **Realistic Physics** - Box2D-based ship simulation with gravity, thrust, rotation
- **Multiplayer** - Real-time WebSocket synchronization
- **Orb Collection** - Pick up orbs and deliver to landing pads for points
- **Fuel Management** - Limited fuel adds strategic challenge
- **Touch Controls** - Virtual joystick for mobile devices
- **Bot Players** - Rule-based and ML-powered AI opponents

---

## 🤖 AI Training Infrastructure

### Training Data Collection (v3.0)

The game automatically collects high-quality training data from human players:

- **Segment-based logging** - Each successful delivery saved separately
- **Auto-start** - Logging begins automatically at game start
- **Crash filtering** - Failed attempts are discarded
- **Master switch** - Toggle logging with `L` key
- **Visual indicator** - Shows logging status in-game

**Data format:**
```
success_segment_TIMESTAMP_scoreN_framesM.json
```

**Each file contains:**
- Metadata (timestamp, score, duration)
- Frame-by-frame game state (position, velocity, controls)
- Final delivery event marker for ML training

### Remote Logs Management

**View logs on server:**
```powershell
.\remote-logs-view.ps1
```

**Download logs:**
```powershell
# Download all
.\remote-logs-download.ps1

# Download last 50 files
.\remote-logs-download.ps1 -LastN 50

# Download last 7 days
.\remote-logs-download.ps1 -LastDays 7
```

**Clean old logs:**
```powershell
# Archive and delete logs older than 30 days
.\remote-logs-clean.ps1 -OlderThanDays 30 -Archive
```

See **[LOGS-MANAGEMENT.md](LOGS-MANAGEMENT.md)** for complete guide.

### ML Bot Training

Two approaches for training AI bots:

**1. Behavioral Cloning (BC)** - Fast supervised learning
- Train on human gameplay logs
- Requires 50-200 successful segments
- Training time: ~30 minutes
- Expected success rate: 40-60%

**2. Reinforcement Learning (PPO)** - Advanced self-play
- Trains in custom Gymnasium environment
- No human data required
- Training time: 4-12 hours
- Expected success rate: 60-80%

**Quick start:**
```bash
# Analyze collected data
cd examples/50-lander_virtual_keyboard
python analyze_successful_deliveries.py

# Train BC model
cd ../../ml_bot
python training/train_bc.py

# Start ML service
python scripts/start_service.py

# In another terminal, start game server
cd ../server
npm start
```

See **[ml_bot/README.md](ml_bot/README.md)** for detailed training instructions (coming soon).

---

## 📁 Project Structure

```
yolo-ide-isogenic-keys-dev.ru/
├── engine/                    # Isogenic Game Engine
├── examples/
│   └── 50-lander_virtual_keyboard/
│       ├── gameClasses/       # Game entities (Player, Orb, etc)
│       ├── assets/            # Textures and sprites
│       ├── logs/              # Training data (auto-created)
│       ├── client.js          # Client-side entry point
│       ├── server.js          # Server-side entry point
│       └── analyze_successful_deliveries.py
├── server/                    # Node.js server
│   ├── ige.js                 # Game engine server
│   ├── package.json
│   └── start.bat
├── ml_bot/                    # ML training infrastructure
│   ├── config.py
│   ├── requirements.txt
│   ├── environment/           # Gymnasium environment
│   ├── training/              # BC and PPO training
│   ├── api/                   # Flask API service
│   └── scripts/               # Utilities
├── remote-logs-view.ps1       # View server logs
├── remote-logs-download.ps1   # Download training data
├── remote-logs-clean.ps1      # Clean old logs
└── *.ps1                      # Other management scripts
```

---

## 🎯 Game Controls

### Desktop
- **Arrow Keys / WASD** - Rotate left/right
- **Space** - Thrust
- **E** - Drop orb
- **L** - Toggle logging (training data collection)

### Mobile
- **Virtual Joystick** - Left/right movement and thrust
- **Drop Button** - Release carried orb

---

## 📊 Training Data Collection

### Enable Logging

In-game, press **L** key to toggle logging system.

**Indicator:**
- `● LOGGING` (white) - Currently recording
- `● LOGGING OFF` (red) - Recording disabled
- No indicator - System enabled but between episodes

### What Gets Logged?

✅ **Recorded:**
- Complete gameplay segments from respawn to successful delivery
- Ship state: position, velocity, rotation, fuel
- Control inputs: left, right, thrust, drop
- Orb/pad positions and distances
- Final delivery event with score

❌ **Not recorded:**
- Crashes (automatically discarded)
- Incomplete segments (if logging disabled mid-flight)

### How Much Data?

**For Behavioral Cloning:**
- Minimum: 50 segments (~5 minutes of gameplay)
- Recommended: 100-200 segments (~15-30 minutes)
- Optimal: 500+ segments (1+ hours)

**Quality > Quantity:** Better to have 100 clean successful deliveries than 1000 frames with crashes.

---

## 🔧 Development Scripts

### Local Server Management

```powershell
.\start-local.ps1          # Start Node.js server
.\stop-local.ps1           # Stop server
.\restart-local.ps1        # Restart server
.\status-local.ps1         # Check status
.\logs-local.ps1           # View logs
```

### Remote Server Management

```powershell
.\remote-start.ps1         # Start remote server
.\remote-stop.ps1          # Stop remote server
.\remote-restart.ps1       # Restart remote server
.\remote-status.ps1        # Check remote status
.\remote-logs.ps1          # View remote logs
.\remote-ssh.ps1           # SSH into server
```

### Logs Management

```powershell
.\remote-logs-view.ps1     # View training logs
.\remote-logs-download.ps1 # Download training data
.\remote-logs-clean.ps1    # Clean old logs
```

See **[SCRIPTS-REFERENCE.md](SCRIPTS-REFERENCE.md)** for complete reference.

---

## 🌐 Deployment

### Production Server

- **URL:** https://yolo-ide-isogenic-keys.ru
- **Server:** Yandex Cloud (51.250.30.92)
- **SSL:** Let's Encrypt (auto-renewal)
- **Process:** systemd service (lander.service)

### Deploy Updates

```powershell
# Quick deploy (from local changes)
.\deploy.ps1

# Or via SSH
.\remote-ssh.ps1
# Then on server:
cd /opt/lander
git pull
sudo systemctl restart lander
```

See **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** for detailed deployment process.

---

## 🧪 Testing ML Bot

```bash
# Start ML API service
cd ml_bot
python scripts/start_service.py

# In browser console (game must be running):
spawnMLBot()

# Bot will connect to API and play using trained model
```

---

## 📚 Documentation

- **[QUICK-START.md](QUICK-START.md)** - Setup and first run
- **[LOGS-MANAGEMENT.md](LOGS-MANAGEMENT.md)** - Training data collection and management
- **[REMOTE-MANAGEMENT.md](REMOTE-MANAGEMENT.md)** - Server administration
- **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** - Deployment procedures
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions
- **ml_bot/README.md** - ML training guide (coming soon)
- **ml_bot/TRAINING_GUIDE.md** - Detailed training instructions (coming soon)

---

## 🛠️ Tech Stack

**Game Engine:**
- Isogenic Game Engine (custom)
- Box2D physics
- Canvas rendering

**Server:**
- Node.js
- Socket.IO (WebSockets)
- Express

**ML Infrastructure:**
- Python 3.9+
- PyTorch
- Stable-Baselines3 (PPO)
- Gymnasium (RL environment)
- Flask (API service)
- ONNX (model export)

**DevOps:**
- Yandex Cloud
- Nginx reverse proxy
- Let's Encrypt SSL
- systemd service management
- PowerShell automation scripts

---

## 📈 ML Bot Performance Goals

| Model | Training Time | Data Required | Success Rate | Fuel Efficiency |
|-------|--------------|---------------|--------------|-----------------|
| Rule-based | - | - | 30-40% | Low |
| BC (Basic) | 30 min | 50 segments | 40-50% | Medium |
| BC (Good) | 1 hour | 200 segments | 50-60% | Medium-High |
| PPO (Basic) | 4 hours | - | 50-60% | Medium |
| PPO (Advanced) | 12 hours | - | 70-80% | High |
| Human Expert | - | - | 90%+ | Very High |

---

## 🤝 Contributing

This is a private learning project, but contributions are welcome!

**Areas for improvement:**
- ML model architectures
- Reward shaping for PPO
- Data augmentation techniques
- Performance optimization
- Documentation

---

## 📝 License

Private project - All rights reserved.

---

## 🔗 Links

- **Production:** https://yolo-ide-isogenic-keys.ru
- **GitHub:** https://github.com/yolokukkonen-me/lander-game
- **Game Engine:** Isogenic Game Engine (v1.x)

---

## 📞 Support

For issues or questions:
1. Check **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**
2. Review relevant documentation
3. Check server logs: `.\remote-logs.ps1`
4. SSH into server: `.\remote-ssh.ps1`

---

**Version:** 3.0  
**Last Updated:** 2025-11-04  
**Status:** Active Development 🚀

