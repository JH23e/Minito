import os
import sys
import shutil
import subprocess

is_windows = sys.platform == 'win32'
if is_windows:
    import ctypes
    import winreg
else:
    winreg = None

INSTALL_DIR = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'MinitoStudent')

# 기존 실행 중인 에이전트 강제 종료 (파일 락 릴리즈)
def kill_existing_agent():
    if not is_windows:
        return
    try:
        subprocess.run(
            "taskkill /F /IM Minito_student.exe /T",
            shell=True,
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
    except Exception:
        pass

# PyInstaller 임시 리소스 폴더 경로 획득
def get_resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', relative_path)

# 설치 폴더 생성 및 복사
def install_files():
    kill_existing_agent()
    
    if not os.path.exists(INSTALL_DIR):
        os.makedirs(INSTALL_DIR)
        
    # 새로운 설치 시, 기존의 config.json 설정 파일을 강제로 초기화(삭제)하여
    # 설치 마법사 기동 시 무조건 최초 설정 대화창이 팝업되도록 보장함
    config_json = os.path.join(INSTALL_DIR, 'config.json')
    if os.path.exists(config_json):
        try:
            os.remove(config_json)
        except Exception:
            pass
    
    agent_src = get_resource_path('Minito_student.exe')
    uninstall_src = get_resource_path('Minito_student_uninstall.exe')
    
    if not os.path.exists(agent_src) or not os.path.exists(uninstall_src):
        agent_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'Minito_student.exe')
        uninstall_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'Minito_student_uninstall.exe')

    shutil.copy2(agent_src, os.path.join(INSTALL_DIR, 'Minito_student.exe'))
    shutil.copy2(uninstall_src, os.path.join(INSTALL_DIR, 'Minito_student_uninstall.exe'))

# 시작프로그램 및 제어판 앱 등록 레지스트리 쓰기
def write_registry():
    if not is_windows:
        return
    
    agent_exe = os.path.join(INSTALL_DIR, 'Minito_student.exe')
    uninstall_exe = os.path.join(INSTALL_DIR, 'Minito_student_uninstall.exe')

    # 1. 시작 프로그램 등록
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, "MinitoAgent", 0, winreg.REG_SZ, f'"{agent_exe}"')
        winreg.CloseKey(key)
    except Exception as e:
        print(f"시작 프로그램 레지스트리 등록 실패: {e}")

    # 2. 윈도우 설정 제어판(앱 및 기능) 언인스톨 정보 등록
    try:
        key = winreg.CreateKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\MinitoStudent"
        )
        winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "Minito Student Agent")
        winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, f'"{uninstall_exe}"')
        winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, "1.0.0")
        winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, "Minito")
        winreg.SetValueEx(key, "DisplayIcon", 0, winreg.REG_SZ, f'"{agent_exe}"')
        winreg.CloseKey(key)
    except Exception as e:
        print(f"제어판 등록 레지스트리 생성 실패: {e}")

def register_firewall():
    if not is_windows:
        return
    try:
        # 기존 규칙 제거 후 Minito 전용 UDP 포트 인바운드 규칙 등록
        subprocess.run('netsh advfirewall firewall delete rule name="Minito Student Agent"', shell=True, capture_output=True)
        subprocess.run('netsh advfirewall firewall add rule name="Minito Student Agent" dir=in action=allow protocol=UDP localport=10101 description="Minito Student UDP Screen Stream"', shell=True, capture_output=True)
        print("[방화벽] 학생용 UDP 포트 인바운드 허용 예외 등록 완료")
    except Exception as e:
        print(f"[방화벽] 예외 등록 실패: {e}")

def run_agent():
    agent_exe = os.path.join(INSTALL_DIR, 'Minito_student.exe')
    if os.path.exists(agent_exe):
        subprocess.Popen(f'"{agent_exe}"', shell=True, creationflags=subprocess.CREATE_NO_WINDOW)

def show_message(text):
    if is_windows:
        ctypes.windll.user32.MessageBoxW(0, text, "Minito Student - 설치 완료", 0x40 | 0x0)

if __name__ == '__main__':
    try:
        install_files()
        write_registry()
        register_firewall()
        run_agent()
        show_message("Minito Student Agent가 컴퓨터에 성공적으로 설치되었습니다.\n설정 프롬프트에 맞춰 정보를 새로 작성해 주세요.")
    except Exception as e:
        if is_windows:
            ctypes.windll.user32.MessageBoxW(0, f"설치 중 오류가 발생했습니다:\n{e}", "설치 오류", 0x10 | 0x0)
        sys.exit(1)
