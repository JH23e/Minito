const dgram = require('dgram');
const os = require('os');

// IP와 서브넷 마스크로 브로드캐스트 주소 계산
function getBroadcastAddress(ip, netmask) {
  try {
    const ipParts = ip.split('.').map(Number);
    const maskParts = netmask.split('.').map(Number);
    const broadcastParts = [];
    for (let i = 0; i < 4; i++) {
      broadcastParts.push(ipParts[i] | (~maskParts[i] & 255));
    }
    return broadcastParts.join('.');
  } catch (e) {
    // 예외 발생 시 C클래스 기본 브로드캐스트 반환
    const parts = ip.split('.');
    parts[3] = '255';
    return parts.join('.');
  }
}

// 활성화된 모든 IPv4 어댑터 주소 및 브로드캐스트 주소 탐색
function getActiveInterfaces() {
  const list = [];
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
        list.push({
          ip: alias.address,
          broadcast: getBroadcastAddress(alias.address, alias.netmask || '255.255.255.0')
        });
      }
    }
  }
  return list;
}

class UdpBeaconBroadcaster {
  constructor(config) {
    this.config = config;
    this.socket = dgram.createSocket('udp4');
    this.intervalId = null;
  }

  // 2초 주기로 활성화된 모든 LAN 대역 상에 자기소개 신호 전송
  start() {
    this.socket.bind(() => {
      this.socket.setBroadcast(true);
      console.log(`[UDP] 다중 어댑터 브로드캐스트 비콘 송출 시작.`);
      
      this.intervalId = setInterval(() => {
        if (!this.config.classroom_id) return;

        const activeInterfaces = getActiveInterfaces();
        activeInterfaces.forEach(iface => {
          const beacon = JSON.stringify({
            classroom_id: this.config.classroom_id,
            server_ip: iface.ip, // 해당 어댑터 대역의 교수 PC IP 장착
            port: this.config.port,
            udp_port: this.config.udp_port
          });
          const buffer = Buffer.from(beacon);
          
          this.socket.send(
            buffer,
            0,
            buffer.length,
            this.config.udp_broadcast_port,
            iface.broadcast, // 해당 어댑터 대역의 전용 브로드캐스트 주소로 정밀 조준
            (err) => {
              if (err) console.error(`[UDP] 비콘 전송 실패 (${iface.broadcast}):`, err.message);
            }
          );
        });
      }, 2000);
    });
  }

  // 비콘 송출 안전 종료
  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    try {
      this.socket.close();
    } catch (e) {}
  }
}

module.exports = UdpBeaconBroadcaster;
