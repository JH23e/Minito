const dgram = require('dgram');

// UDP로 전송되는 쪼개진 화면 패킷을 재조립하는 클래스
class UdpImageReceiver {
  constructor(udpPort, onImageAssembled) {
    this.udpPort = udpPort;
    this.onImageAssembled = onImageAssembled;
    this.socket = dgram.createSocket('udp4');
    
    // 학생 학번별, 이미지 고유 ID별 이미지 조각 보관 버퍼
    this.assembleBuffer = {};
    this.timeoutMs = 3000;
  }

  // UDP 포트 10102 바인딩 및 패킷 조립 스레드 루프 시뮬레이션
  start() {
    this.socket.on('message', (msg) => this.handleMessage(msg));
    this.socket.on('error', (err) => {
      console.error(`[UDP 수신] 소켓 오류:\n${err.stack}`);
      this.socket.close();
    });
    
    this.socket.bind(this.udpPort, () => {
      console.log(`[UDP 수신] 화면 조립 포트 오픈 완료: ${this.udpPort}`);
    });

    // 5초 간격으로 3초 초과된 불완전 버퍼 청소 (메모리 해제)
    setInterval(() => {
      const now = Date.now();
      for (const studentId in this.assembleBuffer) {
        const images = this.assembleBuffer[studentId];
        for (const imageId in images) {
          if (now - images[imageId].timestamp > this.timeoutMs) {
            delete images[imageId];
          }
        }
      }
    }, 5000);
  }

  // 수신된 UDP 패킷의 헤더(28바이트)를 뜯고 조립 진행
  handleMessage(msg) {
    if (msg.length < 28) return;

    // 헤더 파싱 (학번, 이미지 고유 번호, 전체 조각 개수, 현재 조각 번호)
    const studentId = msg.toString('utf8', 0, 20).replace(/\0/g, '').trim();
    const imageId = msg.readUInt32BE(20);
    const totalChunks = msg.readUInt16BE(24);
    const chunkIndex = msg.readUInt16BE(26);
    const payload = msg.subarray(28);

    if (!this.assembleBuffer[studentId]) {
      this.assembleBuffer[studentId] = {};
    }
    if (!this.assembleBuffer[studentId][imageId]) {
      this.assembleBuffer[studentId][imageId] = {
        total: totalChunks,
        count: 0,
        chunks: new Array(totalChunks),
        timestamp: Date.now()
      };
    }

    const imgBuf = this.assembleBuffer[studentId][imageId];
    if (!imgBuf.chunks[chunkIndex]) {
      imgBuf.chunks[chunkIndex] = payload;
      imgBuf.count++;
    }

    // 모든 조각이 수집되었을 때 콜백 발송
    if (imgBuf.count === imgBuf.total) {
      const completeBuffer = Buffer.concat(imgBuf.chunks);
      this.onImageAssembled(studentId, completeBuffer.toString('base64'));
      delete this.assembleBuffer[studentId][imageId];
    }
  }

  // 리시버 닫기
  stop() {
    this.socket.close();
  }
}

module.exports = UdpImageReceiver;
