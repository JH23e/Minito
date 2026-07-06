import sys
import psutil

is_windows = sys.platform == 'win32'
if is_windows:
    import ctypes
    from collections import defaultdict
else:
    defaultdict = dict

# 시스템의 활성 윈도우 타이틀을 수집하고 프로세스를 종료하는 시스템 제어 클래스
class SystemMonitor:
    # OS의 열려있는 보이는 창들의 타이틀 목록을 프로세스 ID별로 매핑해 반환
    @staticmethod
    def get_windows_titles():
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

    # 지정한 이름을 가진 실행 중인 프로세스를 찾아 강제 종료
    @staticmethod
    def kill_process(process_name):
        killed_count = 0
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if proc.info['name'].lower() == process_name.lower():
                    proc.kill()
                    killed_count += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        return killed_count
