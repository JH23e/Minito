const dgram = require('dgram');

// UDP 브로드캐스트 비콘을 송출하여 서버 IP를 광고하는 클래스
class UdpBeaconBroadcaster {
  constructor(config, serverIp) {
    this.config = config;
    this.serverIp = serverIp;
    this.socket = dgram.createSocket('udp4');
    this.intervalId = null;
  }

  // 2초 주기로 LAN 상에 자기소개 신호 전송
  start() {
    this.socket.bind(() => {
      this.socket.setBroadcast(true);
      console.log(`[UDP] 브로드캐스트 비콘 송출 시작.`);
      
      this.intervalId = setInterval(() => {
        const beacon = JSON.stringify({
          classroom_id: this.config.classroom_id,
          server_ip: this.serverIp,
          port: this.config.port,
          udp_port: this.config.udp_port
        });
        const buffer = Buffer.from(beacon);
        
        this.socket.send(
          buffer,
          0,
          buffer.length,
          this.config.udp_broadcast_port,
          '255.255.255.255',
          (err) => {
            if (err) console.error(`[UDP] 비콘 전송 실패:`, err);
          }
        );
      }, 2000);
    });
  }

  // 비콘 송출 안전 종료
  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.socket.close();
  }
}

module.exports = UdpBeaconBroadcaster;
