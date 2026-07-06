import io
from PIL import Image, ImageGrab

# 화면을 캡처하고 리사이즈 및 분할 청크로 가공하는 책임을 가지는 클래스
class ScreenCapturer:
    # 전체 화면을 캡처하고 1024px 비율 리사이즈 및 JPEG 압축 바이너리 반환
    @staticmethod
    def capture_jpeg(quality=60):
        img = ImageGrab.grab()
        target_width = 1024
        ratio = target_width / float(img.size[0])
        target_height = int(float(img.size[1]) * float(ratio))
        img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
        
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='JPEG', quality=quality)
        return img_byte_arr.getvalue()

    # 이미지 바이너리를 1024바이트 조각으로 분할
    @staticmethod
    def split_into_chunks(data, chunk_size=1024):
        total_len = len(data)
        total_chunks = (total_len + chunk_size - 1) // chunk_size
        chunks = []
        for i in range(total_chunks):
            offset = i * chunk_size
            chunks.append(data[offset : offset + chunk_size])
        return chunks
