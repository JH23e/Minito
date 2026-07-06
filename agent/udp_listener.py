import socket
import json
import time

# 서버가 주기적으로 송출하는 UDP 비콘을 리스닝하는 클래스
class UdpBeaconListener:
    def __init__(self, classroom_id):
        self.classroom_id = classroom_id

    # 지정된 강의실 ID에 맞는 서버 주소를 탐색할 때까지 UDP 리스닝을 수행
    def find_server(self):
        print(f"[UDP 수신] {self.classroom_id}호 강의실 서버 탐색 중...")
        udp_listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp_listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        udp_listener.bind(('', 10101))
        
        server_info = None
        while True:
            try:
                udp_listener.settimeout(5.0)
                data, addr = udp_listener.recvfrom(2048)
                beacon = json.loads(data.decode('utf-8'))
                
                if beacon.get('classroom_id') == self.classroom_id:
                    server_info = {
                        "ip": beacon['server_ip'],
                        "port": beacon['port'],
                        "udp_port": beacon['udp_port']
                    }
                    break
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[UDP 수신] 에러: {e}")
                time.sleep(1)
        
        udp_listener.close()
        return server_info
