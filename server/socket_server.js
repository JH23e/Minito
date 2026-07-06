const socketIo = require('socket.io');

// TCP Socket.io 양방향 연결을 관리하는 소켓 서버 클래스
class SocketServer {
  constructor(httpServer) {
    this.io = socketIo(httpServer, { maxHttpBufferSize: 1e7 });
    
    // 메모리 데이터 상태 정보 관리
    this.students = {};
    this.studentIdToSocketId = {};
    this.dashboardSocketId = null;
    
    this.initializeEvents();
  }

  // 실시간 웹소켓 이벤트 바인딩
  initializeEvents() {
    this.io.on('connection', (socket) => {
      const clientIp = socket.handshake.address;

      // 에이전트 등록 요청 수신
      socket.on('register_student', (data) => {
        const { student_id, student_name, pc_number } = data;
        if (!student_id || !student_name) return;

        this.students[socket.id] = {
          socket_id: socket.id,
          student_id,
          student_name,
          pc_number: pc_number || '미지정',
          ip: clientIp,
          status: 'online',
          processes: []
        };
        this.studentIdToSocketId[student_id] = socket.id;
        
        console.log(`[소켓] 학생 접속 등록: ${student_name}(${student_id})`);
        if (this.dashboardSocketId) {
          this.io.to(this.dashboardSocketId).emit('student_connected', this.students[socket.id]);
        }
      });

      // 교수 대시보드 화면 등록 요청 수신
      socket.on('register_dashboard', () => {
        this.dashboardSocketId = socket.id;
        console.log(`[소켓] 교수용 관제 대시보드 연동 완료.`);
        socket.emit('student_list', Object.values(this.students));
      });

      // 에이전트의 딴짓 실행 프로세스 정보 수신
      socket.on('process_list', (data) => {
        const student = this.students[socket.id];
        if (student) {
          student.processes = data.processes || [];
          if (this.dashboardSocketId) {
            this.io.to(this.dashboardSocketId).emit('process_update', {
              socket_id: socket.id,
              student_id: student.student_id,
              processes: student.processes
            });
          }
        }
      });

      // 대시보드 종료 클릭 이벤트를 타겟 에이전트로 라우팅
      socket.on('kill_process', (data) => {
        const { targetSocketId, processName } = data;
        if (this.students[targetSocketId]) {
          this.io.to(targetSocketId).emit('kill_process', { processName });
        }
      });

      // 접속 해제
      socket.on('disconnect', () => {
        if (socket.id === this.dashboardSocketId) {
          this.dashboardSocketId = null;
        } else if (this.students[socket.id]) {
          const student = this.students[socket.id];
          student.status = 'offline';
          
          if (this.dashboardSocketId) {
            this.io.to(this.dashboardSocketId).emit('student_disconnected', {
              socket_id: socket.id,
              student_id: student.student_id
            });
          }
          delete this.studentIdToSocketId[student.student_id];
          delete this.students[socket.id];
        }
      });
    });
  }

  // 조립 완료된 이미지를 교수 대시보드로 실시간 전달
  broadcastScreen(studentId, base64Image) {
    const socketId = this.studentIdToSocketId[studentId];
    if (socketId && this.dashboardSocketId) {
      this.io.to(this.dashboardSocketId).emit('screen_data', {
        socket_id: socketId,
        student_id: studentId,
        image: `data:image/jpeg;base64,${base64Image}`
      });
    }
  }
}

module.exports = SocketServer;
