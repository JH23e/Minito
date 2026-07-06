import os
import sys
import time
import subprocess

try:
    import psutil
except ImportError:
    pass

is_windows = sys.platform == 'win32'
if is_windows:
    import ctypes
    import winreg
else:
    winreg = None

INSTALL_DIR = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'MinitoStudent')

# 에이전트 구동 프로세스 사살
def kill_agent_process():
    try:
        for proc in psutil.process_iter(['pid', 'name']):
            if proc.info['name'].lower() == 'minito_student.exe':
                proc.kill()
    except Exception as e:
        print(f"프로세스 강제 종료 오류: {e}")

# 레지스트리 키 제거
def remove_registry_keys():
    if not is_windows:
        return
    # 1. 시작 프로그램 제거
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE
        )
        winreg.DeleteValue(key, "MinitoAgent")
        winreg.CloseKey(key)
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"시작 프로그램 레지스트리 제거 오류: {e}")

    # 2. 제어판 언인스톨 정보 제거
    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall\MinitoStudent")
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"언인스톨 레지스트리 제거 오류: {e}")

# 자가 삭제 cmd 트릭 가동
def self_destruct_and_exit():
    # 백그라운드로 cmd를 띄워 1초 후 설치 폴더를 통째로 지우도록 함
    cmd = f'timeout /t 1 && rmdir /s /q "{INSTALL_DIR}"'
    subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sys.exit(0)

def show_message(text):
    if is_windows:
        ctypes.windll.user32.MessageBoxW(0, text, "Minito Student - 제거 완료", 0x40 | 0x0)

if __name__ == '__main__':
    kill_agent_process()
    remove_registry_keys()
    show_message("Minito Student Agent가 컴퓨터에서 안전하게 제거되었습니다.")
    self_destruct_and_exit()
