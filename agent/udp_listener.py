import socket
import json
import time
import threading

# 서버들이 주기적으로 송출하는 UDP 비콘을 리스닝하고 생존 주기를 관리하는 클래스
class UdpBeaconListener:
    def __init__(self, classroom_id):
        self.classroom_id = classroom_id
        self.active_servers = {} # { "ip": { "port": 3000, "udp_port": 10102, "last_seen": timestamp } }
        self.running = False
        self.lock = threading.Lock()

    # 백그라운드에서 상시 비콘 청취 스레드 실행
    def start_listening(self):
        self.running = True
        threading.Thread(target=self._listen_loop, daemon=True).start()
        threading.Thread(target=self._cleanup_loop, daemon=True).start()

    def stop(self):
        self.running = False

    def _listen_loop(self):
        print(f"[UDP 리스너] {self.classroom_id}호 강의실 다중 서버 비콘 탐색 개시...")
        udp_listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp_listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # 10101 포트 공유 수신 보장
        try:
            udp_listener.bind(('', 10101))
        except Exception as e:
            print(f"[UDP 리스너] 포트 바인드 실패: {e}")
            return
            
        udp_listener.settimeout(2.0)
        
        while self.running:
            try:
                data, addr = udp_listener.recvfrom(2048)
                beacon = json.loads(data.decode('utf-8'))
                
                # 사용자가 지정한 강의실 번호와 일치하는 신호만 필터링 수집
                if beacon.get('classroom_id') == self.classroom_id:
                    srv_ip = beacon['server_ip']
                    with self.lock:
                        self.active_servers[srv_ip] = {
                            "ip": srv_ip,
                            "port": beacon['port'],
                            "udp_port": beacon['udp_port'],
                            "last_seen": time.time()
                        }
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[UDP 리스너] 청취 루프 에러: {e}")
                time.sleep(1)
                
        udp_listener.close()

    # 5초 이상 신호 갱신이 없는 오프라인 교수 PC는 감지 목록에서 자동 소거
    def _cleanup_loop(self):
        while self.running:
            time.sleep(2)
            now = time.time()
            with self.lock:
                to_delete = []
                for ip, info in self.active_servers.items():
                    if now - info["last_seen"] > 5.0:
                        to_delete.append(ip)
                for ip in to_delete:
                    print(f"[UDP 리스너] 교수 PC 오프라인 감지 및 삭제: {ip}")
                    del self.active_servers[ip]

    # 현재 살아있는 모든 교수 PC 정보 목록 반환
    def get_servers(self):
        with self.lock:
            return list(self.active_servers.values())

