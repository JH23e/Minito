const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');

// 분리된 모듈 로드
const ConfigManager = require('./config_manager');
const UdpBeaconBroadcaster = require('./udp_broadcaster');
const UdpImageReceiver = require('./udp_receiver');
const SocketServer = require('./socket_server');

// 모든 개별 모듈을 초기화하고 실행하는 마스터 오케스트레이터 클래스
class ClassGuardServer {
  constructor() {
    this.configManager = new ConfigManager();
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.socketServer = new SocketServer(this.httpServer);
    
    this.serverIp = this.getLocalIP();
    this.broadcaster = new UdpBeaconBroadcaster(this.configManager.config, this.serverIp);
    this.imageReceiver = new UdpImageReceiver(
      this.configManager.config.udp_port, 
      (studentId, base64Image) => this.socketServer.broadcastScreen(studentId, base64Image)
    );

    this.configureExpress();
  }

  // Express 라우트 및 static 폴더 서빙 세팅
  configureExpress() {
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.post('/api/config', express.json(), (req, res) => {
      const { classroom_id } = req.body;
      if (classroom_id && this.configManager.updateClassroomId(classroom_id)) {
        console.log(`[설정] 강의실 ID 변경 반영: ${classroom_id}`);
        res.json({ success: true, classroom_id });
      } else {
        res.status(400).json({ error: "실패" });
      }
    });
  }

  // 윈도우 OS의 실제 사설 IP 주소 탐지
  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
          return alias.address;
        }
      }
    }
    return '127.0.0.1';
  }

  // 모든 서버 스레드/서브시스템 구동 시작
  start() {
    console.log(`[네트워크] 서버 IP 감지: ${this.serverIp}`);
    
    this.broadcaster.start();
    this.imageReceiver.start();

    this.httpServer.listen(this.configManager.config.port, () => {
      console.log(`[서버] 웹소켓 서버 기동 완료: http://localhost:${this.configManager.config.port}`);
    });
  }
}

// 싱글톤 기동
const server = new ClassGuardServer();
server.start();
