const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const dgram = require('dgram');
const os = require('os');
const path = require('path');
const fs = require('fs');

// 1. 설정 로드
const configPath = path.join(__dirname, 'config.json');
let config = {
  classroom_id: "301",
  port: 3000,
  udp_port: 10102,
  udp_broadcast_port: 10101
};

if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error("설정 파일 로드 실패, 기본값 사용:", err);
  }
}

const app = express();
const httpServer = http.createServer(app);
const io = socketIo(httpServer, {
  maxHttpBufferSize: 1e7 // 이미지 데이터 전송을 위해 버퍼 크기 증가
});

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 메모리 데이터 저장소
const students = {}; // socket.id -> { student_id, student_name, pc_number, ip, status: 'online' }
// student_id -> socket.id 매핑 (UDP 수신용)
const studentIdToSocketId = {};
let dashboardSocketId = null;

// UDP 조립 버퍼
// 구조: { [student_id]: { [image_id]: { total: N, count: M, chunks: [], timestamp: Date.now() } } }
const udpAssembleBuffer = {};
const UDP_TIMEOUT_MS = 3000; // 3초 경과 시 버퍼 폐기

// 주기적 조립 버퍼 청소 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const studentId in udpAssembleBuffer) {
    const images = udpAssembleBuffer[studentId];
    for (const imageId in images) {
      if (now - images[imageId].timestamp > UDP_TIMEOUT_MS) {
        delete images[imageId];
      }
    }
  }
}, 5000);

// 로컬 사설 IP 구하기 함수
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIpAddress = getLocalIP();
console.log(`[네트워크] 서버 로컬 IP: ${localIpAddress}`);

// ----------------------------------------------------
// 2. TCP 소켓 통신 (Socket.io)
// ----------------------------------------------------
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`[소켓] 신규 연결 요청: ${socket.id} (${clientIp})`);

  // 학생 등록
  socket.on('register_student', (data) => {
    const { student_id, student_name, pc_number } = data;
    if (!student_id || !student_name) {
      console.warn(`[소켓] 잘못된 학생 등록 요청:`, data);
      return;
    }

    students[socket.id] = {
      socket_id: socket.id,
      student_id,
      student_name,
      pc_number: pc_number || '미지정',
      ip: clientIp,
      status: 'online',
      processes: []
    };
    
    studentIdToSocketId[student_id] = socket.id;

    console.log(`[소켓] 학생 등록 완료: ${student_name}(${student_id}), PC ${pc_number || 'N/A'}`);
    
    // 대시보드에 신규 학생 접속 알림
    if (dashboardSocketId) {
      io.to(dashboardSocketId).emit('student_connected', students[socket.id]);
    }
  });

  // 대시보드 등록
  socket.on('register_dashboard', () => {
    dashboardSocketId = socket.id;
    console.log(`[소켓] 교수 대시보드가 연결되었습니다: ${socket.id}`);
    
    // 현재 접속된 학생 목록을 대시보드로 즉시 전송
    socket.emit('student_list', Object.values(students));
  });

  // 학생의 프로세스 목록 수신 및 대시보드로 중계
  socket.on('process_list', (data) => {
    const student = students[socket.id];
    if (student) {
      student.processes = data.processes || [];
      if (dashboardSocketId) {
        io.to(dashboardSocketId).emit('process_update', {
          socket_id: socket.id,
          student_id: student.student_id,
          processes: student.processes
        });
      }
    }
  });

  // 대시보드로부터 강제 종료 명령을 수신하여 해당 학생으로 라우팅
  socket.on('kill_process', (data) => {
    const { targetSocketId, processName } = data;
    console.log(`[소켓] 프로세스 종료 명령 수신. 대상: ${targetSocketId}, 프로세스: ${processName}`);
    if (students[targetSocketId]) {
      io.to(targetSocketId).emit('kill_process', { processName });
    } else {
      console.warn(`[소켓] 강제 종료 명령을 보낼 대상을 찾을 수 없음: ${targetSocketId}`);
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`[소켓] 연결 해제됨: ${socket.id}`);
    
    if (socket.id === dashboardSocketId) {
      dashboardSocketId = null;
      console.log(`[소켓] 대시보드 접속 종료`);
    } else if (students[socket.id]) {
      const student = students[socket.id];
      student.status = 'offline';
      
      console.log(`[소켓] 학생 접속 종료: ${student.student_name}(${student.student_id})`);
      
      if (dashboardSocketId) {
        io.to(dashboardSocketId).emit('student_disconnected', {
          socket_id: socket.id,
          student_id: student.student_id
        });
      }
      
      delete studentIdToSocketId[student.student_id];
      delete students[socket.id];
    }
  });
});

// ----------------------------------------------------
// 3. UDP 브로드캐스트 비콘 송출 (dgram)
// ----------------------------------------------------
const udpBroadcaster = dgram.createSocket('udp4');

udpBroadcaster.bind(() => {
  udpBroadcaster.setBroadcast(true);
  console.log(`[UDP] 브로드캐스트 소켓 준비 완료.`);
  
  // 2초 주기 비콘 발송
  setInterval(() => {
    const beacon = JSON.stringify({
      classroom_id: config.classroom_id,
      server_ip: localIpAddress,
      port: config.port,
      udp_port: config.udp_port
    });
    
    const buffer = Buffer.from(beacon);
    
    udpBroadcaster.send(
      buffer,
      0,
      buffer.length,
      config.udp_broadcast_port,
      '255.255.255.255',
      (err) => {
        if (err) {
          console.error(`[UDP] 브로드캐스트 송신 실패:`, err);
        }
      }
    );
  }, 2000);
});

// 대시보드에서 실시간으로 강의실 ID를 동적으로 업데이트하기 위한 서버 API/이벤트 추가
app.post('/api/config', express.json(), (req, res) => {
  const { classroom_id } = req.body;
  if (classroom_id) {
    config.classroom_id = classroom_id;
    // 임시 보관 및 파일 쓰기
    fs.writeFile(configPath, JSON.stringify(config, null, 2), (err) => {
      if (err) console.error("설정 저장 실패:", err);
    });
    console.log(`[설정] 강의실 ID가 동적으로 변경됨: ${config.classroom_id}`);
    res.json({ success: true, classroom_id: config.classroom_id });
  } else {
    res.status(400).json({ error: "classroom_id는 필수입니다." });
  }
});

// ----------------------------------------------------
// 4. UDP 화면 조립 및 수신 서버 (dgram)
// ----------------------------------------------------
const udpImageReceiver = dgram.createSocket('udp4');

udpImageReceiver.on('error', (err) => {
  console.error(`[UDP 수신] 소켓 에러:\n${err.stack}`);
  udpImageReceiver.close();
});

udpImageReceiver.on('message', (msg, rinfo) => {
  // 패킷 크기가 헤더 최소 크기(28바이트)보다 작으면 폐기
  if (msg.length < 28) return;

  // 헤더 파싱
  // 1. student_id (0~19 바이트, Null 패딩 문자 제거)
  const studentId = msg.toString('utf8', 0, 20).replace(/\0/g, '').trim();
  // 2. image_id (20~23 바이트, UInt32BE)
  const imageId = msg.readUInt32BE(20);
  // 3. total_chunks (24~25 바이트, UInt16BE)
  const totalChunks = msg.readUInt16BE(24);
  // 4. chunk_index (26~27 바이트, UInt16BE)
  const chunkIndex = msg.readUInt16BE(26);

  // Payload (28바이트 이후)
  const payload = msg.subarray(28);

  const socketId = studentIdToSocketId[studentId];
  if (!socketId) {
    // TCP 소켓 연결이 없는 학생의 UDP 화면 조각은 조립하지 않고 버림
    return;
  }

  // 조립 버퍼 세팅
  if (!udpAssembleBuffer[studentId]) {
    udpAssembleBuffer[studentId] = {};
  }

  if (!udpAssembleBuffer[studentId][imageId]) {
    udpAssembleBuffer[studentId][imageId] = {
      total: totalChunks,
      count: 0,
      chunks: new Array(totalChunks),
      timestamp: Date.now()
    };
  }

  const imgBuf = udpAssembleBuffer[studentId][imageId];
  
  // 이미 수신한 조각이 아닐 때만 저장
  if (!imgBuf.chunks[chunkIndex]) {
    imgBuf.chunks[chunkIndex] = payload;
    imgBuf.count++;
  }

  // 전체 조각이 모두 모였는지 검증
  if (imgBuf.count === imgBuf.total) {
    // 조각 조립
    const completeImageBuffer = Buffer.concat(imgBuf.chunks);
    const base64Image = completeImageBuffer.toString('base64');
    
    // 대시보드로 조립된 이미지 스트림 중계
    if (dashboardSocketId) {
      io.to(dashboardSocketId).emit('screen_data', {
        socket_id: socketId,
        student_id: studentId,
        image: `data:image/jpeg;base64,${base64Image}`
      });
    }

    // 완성된 이미지 버퍼 삭제 (메모리 해제)
    delete udpAssembleBuffer[studentId][imageId];
  }
});

udpImageReceiver.on('listening', () => {
  const address = udpImageReceiver.address();
  console.log(`[UDP 수신] 화면 수신 포트 대기 중: ${address.address}:${address.port}`);
});

udpImageReceiver.bind(config.udp_port);

// HTTP 서버 시작
httpServer.listen(config.port, () => {
  console.log(`[서버] HTTP/Socket.io 포트 대기 중: http://localhost:${config.port}`);
});
