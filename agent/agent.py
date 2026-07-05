import os
import sys
import json
import time
import socket
import struct
import threading
import tkinter as tk
from tkinter import messagebox
import io

# 외부 라이브러리 임포트 예외 처리
try:
    import socketio
    from PIL import Image, ImageGrab
    import psutil
except ImportError:
    print("[에러] 필수 라이브러리가 설치되지 않았습니다. requirements.txt를 설치해주세요.")
    sys.exit(1)

# Windows 전용 ctypes 모듈 임포트
is_windows = sys.platform == 'win32'
if is_windows:
    import ctypes
    import winreg
    from collections import defaultdict
else:
    # 윈도우가 아닐 경우의 더미 클래스/변수 정의
    winreg = None
    defaultdict = dict

# 설정 파일 경로
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

# 기본 설정값
config_data = {
    "classroom_id": "",
    "student_id": "",
    "student_name": "",
    "pc_number": ""
}

# ----------------------------------------------------
# 1. Windows 시작프로그램 등록 및 윈도우 타이틀 수집
# ----------------------------------------------------
def register_to_startup():
    if not is_windows:
        return
    try:
        # 실행 중인 파일 경로 획득
        exe_path = os.path.abspath(sys.argv[0])
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE
        )
        # ClassGuardAgent 이름으로 레지스트리 등록
        winreg.SetValueEx(key, "ClassGuardAgent", 0, winreg.REG_SZ, f'"{exe_path}"')
        winreg.CloseKey(key)
        print("[설정] 시작프로그램 등록 성공")
    except Exception as e:
        print(f"[설정] 시작프로그램 등록 실패: {e}")

def get_windows_titles():
    """Windows ctypes API를 사용하여 열려 있는 보이는 윈도우 타이틀을 수집"""
    if not is_windows:
        return {}
    
    titles = defaultdict(list)
    EnumWindows = ctypes.windll.user32.EnumWindows
    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    GetWindowText = ctypes.windll.user32.GetWindowTextW
    GetWindowTextLength = ctypes.windll.user32.GetWindowTextLengthW
    GetWindowThreadProcessId = ctypes.windll.user32.GetWindowThreadProcessId
    IsWindowVisible = ctypes.windll.user32.IsWindowVisible

    def foreach_window(hwnd, lParam):
        if IsWindowVisible(hwnd):
            length = GetWindowTextLength(hwnd)
            if length > 0:
                buff = ctypes.create_unicode_buffer(length + 1)
                GetWindowText(hwnd, buff, length + 1)
                pid = ctypes.c_ulong()
                GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                title = buff.value.strip()
                if title:
                    titles[pid.value].append(title)
        return True

    EnumWindows(EnumWindowsProc(foreach_window), 0)
    return titles

# ----------------------------------------------------
# 2. 최초 실행 설정 GUI (Tkinter)
# ----------------------------------------------------
def load_config():
    global config_data
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                config_data.update(loaded)
        except Exception as e:
            print(f"[설정] 파일 로드 오류: {e}")

def save_config(classroom_id, student_id, student_name, pc_number):
    config = {
        "classroom_id": classroom_id,
        "student_id": student_id,
        "student_name": student_name,
        "pc_number": pc_number
    }
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[설정] 저장 실패: {e}")
        return False

def show_setup_gui():
    root = tk.Tk()
    root.title("ClassGuard Agent - 최초 설정")
    root.geometry("380x300")
    root.resizable(False, False)

    # 화면 중앙 배치
    window_width = 380
    window_height = 300
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    position_top = int(screen_height / 2 - window_height / 2)
    position_right = int(screen_width / 2 - window_width / 2)
    root.geometry(f"{window_width}x{window_height}+{position_right}+{position_top}")

    # 타이틀
    tk.Label(root, text="ClassGuard Agent 설정", font=("Inter", 14, "bold")).pack(pady=10)

    # 입력 폼 그리드 프레임
    form_frame = tk.Frame(root)
    form_frame.pack(pady=10)

    # 필드들
    tk.Label(form_frame, text="강의실 번호 (호):").grid(row=0, column=0, sticky='e', pady=5, padx=5)
    entry_room = tk.Entry(form_frame)
    entry_room.grid(row=0, column=1, pady=5)
    entry_room.insert(0, config_data["classroom_id"] or "301")

    tk.Label(form_frame, text="학번 (ID):").grid(row=1, column=0, sticky='e', pady=5, padx=5)
    entry_id = tk.Entry(form_frame)
    entry_id.grid(row=1, column=1, pady=5)
    entry_id.insert(0, config_data["student_id"])

    tk.Label(form_frame, text="이름 (Name):").grid(row=2, column=0, sticky='e', pady=5, padx=5)
    entry_name = tk.Entry(form_frame)
    entry_name.grid(row=2, column=1, pady=5)
    entry_name.insert(0, config_data["student_name"])

    tk.Label(form_frame, text="PC 번호:").grid(row=3, column=0, sticky='e', pady=5, padx=5)
    entry_pc = tk.Entry(form_frame)
    entry_pc.grid(row=3, column=1, pady=5)
    entry_pc.insert(0, config_data["pc_number"])

    # 시작프로그램 등록 옵션
    startup_var = tk.BooleanVar(value=True)
    tk.Checkbutton(root, text="부팅 시 백그라운드 자동 실행 등록", variable=startup_var).pack(pady=5)

    def on_submit():
        room = entry_room.get().strip()
        sid = entry_id.get().strip()
        sname = entry_name.get().strip()
        spc = entry_pc.get().strip()

        if not room or not sid or not sname:
            messagebox.showerror("입력 오류", "강의실, 학번, 이름은 필수 항목입니다.")
            return

        if save_config(room, sid, sname, spc):
            if startup_var.get():
                register_to_startup()
            root.destroy()
        else:
            messagebox.showerror("저장 오류", "설정 파일을 저장하는 데 실패했습니다.")

    tk.Button(root, text="확인 및 적용", command=on_submit, width=15, bg="#4f46e5", fg="white").pack(pady=10)
    root.mainloop()

# ----------------------------------------------------
# 3. 네트워크 통신 엔진 (UDP 자동 탐색 + TCP 연결)
# ----------------------------------------------------
class ClassGuardAgentClient:
    def __init__(self):
        self.sio = socketio.Client()
        self.server_ip = None
        self.server_port = None
        self.server_udp_port = None
        
        self.running = False
        self.connected = False
        
        self.udp_send_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
        # 소켓 이벤트 핸들러 바인딩
        self.sio.on('connect', self.on_connect)
        self.sio.on('disconnect', self.on_disconnect)
        self.sio.on('kill_process', self.on_kill_process)

    def listen_udp_beacon(self):
        """서버의 UDP 브로드캐스트 비콘을 수신하여 서버 정보 획득"""
        print(f"[UDP 수신] 강의실 {config_data['classroom_id']}호 서버 비콘 대기 중...")
        
        udp_listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp_listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # 브로드캐스트 포트 바인딩 (서버 포트: 10101)
        udp_listener.bind(('', 10101))
        
        while self.running:
            try:
                udp_listener.settimeout(5.0)
                data, addr = udp_listener.recvfrom(2048)
                beacon = json.loads(data.decode('utf-8'))
                
                # 내가 속한 강의실 ID와 비콘의 강의실 ID 비교
                if beacon.get('classroom_id') == config_data['classroom_id']:
                    self.server_ip = beacon['server_ip']
                    self.server_port = beacon['port']
                    self.server_udp_port = beacon['udp_port']
                    print(f"[UDP 수신] 서버 발견: {self.server_ip}:{self.server_port} (UDP 수신처: {self.server_udp_port})")
                    break
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[UDP 수신] 비콘 수집 오류: {e}")
                time.sleep(1)
        
        udp_listener.close()

    def on_connect(self):
        print("[소켓] 교수용 PC 서버 연결 성공.")
        self.connected = True
        # 학생 기본 정보 등록
        self.sio.emit('register_student', {
            "student_id": config_data['student_id'],
            "student_name": config_data['student_name'],
            "pc_number": config_data['pc_number']
        })

    def on_disconnect(self):
        print("[소켓] 교수용 PC 서버와 연결이 해제되었습니다.")
        self.connected = False

    def on_kill_process(self, data):
        process_name = data.get('processName')
        print(f"[소켓] 원격 프로세스 강제 종료 명령 수신: {process_name}")
        
        killed_count = 0
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                # 대소문자 구분 없이 종료할 프로세스 이름 대조
                if proc.info['name'].lower() == process_name.lower():
                    proc.kill()
                    killed_count += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        print(f"[제어] 프로세스 '{process_name}' 종료 완료 (종료 수: {killed_count})")

    def send_screen_feed(self):
        """2초 주기로 화면을 캡처하고 조각(Chunk)으로 나누어 UDP로 전송"""
        image_id_counter = 0
        
        while self.running:
            if not self.connected or not self.server_ip or not self.server_udp_port:
                time.sleep(1)
                continue
                
            try:
                start_time = time.time()
                
                # 1. 화면 캡처
                img = ImageGrab.grab()
                
                # 2. 리사이즈 (가로 1024px 기준 맞춤)
                target_width = 1024
                ratio = target_width / float(img.size[0])
                target_height = int(float(img.size[1]) * float(ratio))
                img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
                
                # 3. JPEG 압축 바이너리 변환
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='JPEG', quality=60)
                img_bytes = img_byte_arr.getvalue()
                
                # 4. 이미지 분할 전송 (UDP)
                total_len = len(img_bytes)
                chunk_size = 1024
                total_chunks = (total_len + chunk_size - 1) // chunk_size
                
                # 4바이트 이미지 고유 ID 생성 (오버플로우 방지)
                image_id_counter = (image_id_counter + 1) & 0xffffffff
                
                # 학번 정보 20바이트 고정 길이 바이트 패딩
                student_id_bytes = config_data['student_id'].encode('utf-8')[:20]
                student_id_bytes = student_id_bytes.ljust(20, b'\x00')
                
                for i in range(total_chunks):
                    offset = i * chunk_size
                    chunk_data = img_bytes[offset : offset + chunk_size]
                    
                    # UDP 헤더 패킹 (28바이트)
                    # 구조: student_id(20B) + image_id(4B, UInt32) + total_chunks(2B, UInt16) + chunk_index(2B, UInt16)
                    header = struct.pack('!20sIHH', student_id_bytes, image_id_counter, total_chunks, i)
                    packet = header + chunk_data
                    
                    self.udp_send_socket.sendto(
                        packet, 
                        (self.server_ip, self.server_udp_port)
                    )
                
                # 2초 주기 유지를 위한 지연 조정
                elapsed = time.time() - start_time
                sleep_time = max(0.1, 2.0 - elapsed)
                time.sleep(sleep_time)
                
            except Exception as e:
                print(f"[화면 전송] 캡처 및 전송 실패: {e}")
                time.sleep(2)

    def send_process_list(self):
        """5초 주기로 GUI 활성 윈도우 타이틀이 있는 일반 애플리케이션 목록을 서버로 전송"""
        while self.running:
            if not self.connected:
                time.sleep(1)
                continue
                
            try:
                # 1. 열려 있는 윈도우 타이틀 가져오기
                win_titles = get_windows_titles()
                process_data = []

                # 2. 실행 중인 프로세스 열거하며 타이틀 매칭
                for proc in psutil.process_iter(['pid', 'name']):
                    try:
                        pid = proc.info['pid']
                        name = proc.info['name']
                        
                        # 이 프로세스 ID로 생성된 보이는 윈도우 타이틀이 있는지 확인
                        if pid in win_titles:
                            for title in win_titles[pid]:
                                # 기본 윈도우 시스템 트레이, 데스크톱 관련 더미 필터링
                                if title in ["Default IMONitor Window", "Program Manager", "Start"]:
                                    continue
                                    
                                process_data.append({
                                    "name": name,
                                    "title": title
                                })
                    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                        continue

                # 3. 소켓을 통해 서버로 전송
                self.sio.emit('process_list', {
                    "processes": process_data
                })
                
                time.sleep(5)
            except Exception as e:
                print(f"[프로세스] 목록 수집 및 송신 실패: {e}")
                time.sleep(5)

    def start(self):
        self.running = True
        
        # 1. 화면 전송 스레드 가동
        screen_thread = threading.Thread(target=self.send_screen_feed, daemon=True)
        screen_thread.start()
        
        # 2. 프로세스 목록 전송 스레드 가동
        process_thread = threading.Thread(target=self.send_process_list, daemon=True)
        process_thread.start()
        
        # 3. 메인 자동 연결 루프
        while self.running:
            if not self.connected:
                # 비콘 수집
                self.listen_udp_beacon()
                
                if self.server_ip and self.server_port:
                    try:
                        server_url = f"http://{self.server_ip}:{self.server_port}"
                        print(f"[소켓] 서버에 연결을 시도합니다: {server_url}")
                        self.sio.connect(server_url, wait_timeout=5)
                        self.sio.wait()
                    except Exception as e:
                        print(f"[소켓] 연결 실패: {e}. 3초 후 재시도합니다.")
                        self.connected = False
                        time.sleep(3)
            else:
                time.sleep(1)

    def stop(self):
        self.running = False
        try:
            self.sio.disconnect()
        except:
            pass
        self.udp_send_socket.close()

# ----------------------------------------------------
# 4. 진입점
# ----------------------------------------------------
if __name__ == '__main__':
    # 1. 설정 로드
    load_config()

    # 2. 필수 값 누락 시 GUI 다이얼로그 호출
    if (not config_data["classroom_id"] or 
        not config_data["student_id"] or 
        not config_data["student_name"]):
        show_setup_gui()
        # 설정 변경 후 재로드
        load_config()
    
    # 3. 설정이 성공적으로 마쳐졌으면 통신 코어 시작
    if (config_data["classroom_id"] and 
        config_data["student_id"] and 
        config_data["student_name"]):
        print("[에이전트] ClassGuard Agent 가동.")
        print(f"[정보] 학번: {config_data['student_id']} | 이름: {config_data['student_name']} | 강의실: {config_data['classroom_id']}호")
        
        client = ClassGuardAgentClient()
        try:
            client.start()
        except KeyboardInterrupt:
            print("[에이전트] 강제 종료 요청 수신.")
            client.stop()
    else:
        print("[설정 실패] 필수 입력 정보가 없어 기동을 중단합니다.")
        sys.exit(1)
