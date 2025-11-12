import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Video, RotateCcw, Zap, AlertCircle, Brain, TrendingUp, Eye } from 'lucide-react';

let ws = null;
let recognition = null;
let isListening = false;
let speechTimeout = null;

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [score, setScore] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [eyeContactScore, setEyeContactScore] = useState(0);
  const [analysis, setAnalysis] = useState({});
  const [faceDetected, setFaceDetected] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  const interviewQuestions = [
    "Tell me about yourself",
    "What are your greatest strengths?",
    "What is your greatest weakness?",
    "Why do you want to work here?",
    "Describe a challenging situation and how you handled it",
    "Where do you see yourself in 5 years?",
    "Why should we hire you?",
    "Tell me about a time you failed and what you learned",
    "How do you handle stress and pressure?",
    "What is your biggest achievement?"
  ];

  const videoRef = useRef(null);
  const recordingTimer = useRef(null);
  const eyeContactInterval = useRef(null);
  const canvasRef = useRef(null);
  const lastSpeechTime = useRef(null);

  // Load face-api models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js';
        script.async = true;
        
        script.onload = async () => {
          console.log('Script loaded, loading models...');
          
          try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
            
            await Promise.all([
              window.faceapi.nets.tinyFaceDetector.load(MODEL_URL),
              window.faceapi.nets.faceLandmark68Net.load(MODEL_URL),
            ]);
            
            setModelsLoaded(true);
            console.log('✅ All models loaded successfully');
          } catch (modelError) {
            console.error('Model loading error:', modelError);
            setError('Failed to load AI models');
          }
        };
        
        script.onerror = () => {
          console.error('Failed to load face-api script');
          setError('Failed to load face detection library');
        };
        
        document.head.appendChild(script);
      } catch (err) {
        console.error('Setup error:', err);
        setError('Setup error: ' + err.message);
      }
    };

    loadModels();
  }, []);

  // Setup WebSocket with better connection handling
  const setupWebSocket = useCallback(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const WS_URL = 'ws://localhost:3001';
      console.log('🔌 Connecting to WebSocket:', WS_URL);
      
      ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected!');
        resolve();
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Message received:', data.type);
          
          if (data.type === 'final_analysis') {
            console.log('✅ Analysis received');
            setTranscript(data.transcript);
            setScore(data.score);
            setSuggestions(data.suggestions);
            setAnalysis(data.analysis);
            setShowFeedback(true);
          } else if (data.type === 'error') {
            console.error('❌ Backend error:', data.message);
            setError(data.message);
          } else {
            console.log('📨 Other message:', data);
          }
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setError('Connection error - check if backend is running on port 3001');
        reject(error);
      };
      
      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
      };
    });
  }, []);

  // Improved Speech Recognition Setup
  const setupSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('❌ Speech Recognition not supported in this browser. Use Chrome, Edge, or Safari.');
      console.error('Speech Recognition API not available');
      return;
    }
    
    if (recognition) {
      console.log('✅ Speech Recognition already initialized');
      return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.language = 'en-US';
    
    // Prevent automatic timeout
    recognition.onspeechstart = () => {
      console.log('🎤 Speech detected');
      lastSpeechTime.current = Date.now();
    };
    
    console.log('🎤 Speech Recognition initialized');
    
    recognition.onstart = () => {
      console.log('🎤 Speech recognition started - listening...');
      isListening = true;
    };
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let newInterimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          console.log('✅ Final transcript:', transcript);
        } else {
          newInterimTranscript += transcript;
        }
      }
      
      // Update interim transcript in UI
      if (newInterimTranscript) {
        setInterimTranscript(newInterimTranscript);
        console.log('📝 Interim transcript:', newInterimTranscript);
      }
      
      // Send interim results to backend for real-time processing
      if (newInterimTranscript && ws && ws.readyState === WebSocket.OPEN) {
        console.log('📤 Sending interim transcript');
        ws.send(JSON.stringify({
          type: 'interim_transcript',
          transcript: newInterimTranscript
        }));
      }
      
      if (finalTranscript) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          console.log('📤 Sending to backend:', finalTranscript.trim());
          ws.send(JSON.stringify({
            type: 'transcript',
            transcript: finalTranscript.trim()
          }));
          setTranscript(prev => prev + finalTranscript);
          setInterimTranscript(''); // Clear interim after final
        } else {
          console.warn('⚠️ WebSocket not connected. Status:', ws?.readyState);
        }
      }
      
      // Reset speech timeout
      if (finalTranscript || newInterimTranscript) {
        lastSpeechTime.current = Date.now();
      }
    };
    
    recognition.onerror = (event) => {
      console.error('❌ Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        console.log('🔇 No speech detected, continuing to listen...');
        // Don't set error for no-speech, just keep listening
      } else if (event.error === 'network') {
        setError('Network error in speech recognition');
      } else {
        setError(`Speech error: ${event.error}`);
      }
    };
    
    recognition.onend = () => {
      console.log('🔇 Speech recognition ended');
      isListening = false;
      
      // Auto-restart if we're still recording
      if (isRecording && recognition) {
        console.log('🔄 Auto-restarting speech recognition');
        try {
          recognition.start();
        } catch (err) {
          console.log('⏳ Waiting before restart...');
          setTimeout(() => {
            if (isRecording && recognition) {
              recognition.start();
            }
          }, 1000);
        }
      }
    };
  }, [isRecording]);

  // Speech timeout checker
  useEffect(() => {
    if (isRecording) {
      speechTimeout = setInterval(() => {
        if (lastSpeechTime.current && Date.now() - lastSpeechTime.current > 10000) { // 10 seconds of silence
          console.log('🔄 Restarting speech recognition due to timeout');
          if (recognition && isListening) {
            recognition.stop();
          }
          lastSpeechTime.current = null;
        }
      }, 5000);
    }
    
    return () => {
      if (speechTimeout) clearInterval(speechTimeout);
    };
  }, [isRecording]);

  // Eye Contact Detection
  const detectEyeContact = useCallback(async () => {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    if (!window.faceapi) return;

    try {
      const video = videoRef.current;
      
      const detections = await window.faceapi.detectAllFaces(
        video,
        new window.faceapi.TinyFaceDetectorOptions()
      ).withFaceLandmarks();

      if (detections && detections.length > 0) {
        setFaceDetected(true);
        const detection = detections[0];
        const box = detection.detection.box;
        
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;
        
        const videoCenterX = videoWidth / 2;
        const videoCenterY = videoHeight / 2;
        
        const xTolerance = videoWidth * 0.15;
        const yTolerance = videoHeight * 0.15;
        
        const xOffset = Math.abs(faceCenterX - videoCenterX);
        const yOffset = Math.abs(faceCenterY - videoCenterY);
        
        let score = 50;
        
        if (xOffset < xTolerance * 0.5 && yOffset < yTolerance * 0.5) {
          score = 90;
        } else if (xOffset < xTolerance && yOffset < yTolerance) {
          score = 75;
        } else if (xOffset < xTolerance * 1.5 && yOffset < yTolerance * 1.5) {
          score = 60;
        } else {
          score = 40;
        }
        
        score = Math.round(Math.max(0, Math.min(100, score)));
        setEyeContactScore(score);
        
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'eye_contact',
            score: score
          }));
        }
      } else {
        setFaceDetected(false);
        setEyeContactScore(0);
      }
    } catch (error) {
      console.warn('Eye contact detection error:', error);
    }
  }, []);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingTimer.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    };
  }, [isRecording]);

  // Eye contact detection interval
  useEffect(() => {
    if (isRecording && videoRef.current && videoRef.current.srcObject && modelsLoaded) {
      eyeContactInterval.current = setInterval(detectEyeContact, 500);
    }
    return () => {
      if (eyeContactInterval.current) clearInterval(eyeContactInterval.current);
    };
  }, [isRecording, modelsLoaded, detectEyeContact]);

  // Improved Start Recording
  const startRecording = async () => {
    console.log('🎙️ Starting recording...');
    console.log('Models loaded:', modelsLoaded);
    
    if (!modelsLoaded) {
      setError('Face detection models still loading...');
      console.warn('Models not loaded yet');
      return;
    }

    setError('');
    setIsLoading(true);
    setRecordingTime(0);
    setTranscript('');
    setInterimTranscript('');
    setScore(null);
    setSuggestions([]);
    setEyeContactScore(0);
    lastSpeechTime.current = null;

    const randomIndex = Math.floor(Math.random() * interviewQuestions.length);
    const question = interviewQuestions[randomIndex];
    setCurrentQuestion(question);
    console.log('❓ Question:', question);

    try {
      console.log('🔌 Setting up WebSocket...');
      await setupWebSocket();
      
      // Wait for WebSocket to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('🎤 Setting up Speech Recognition...');
      setupSpeechRecognition();

      console.log('🎥 Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true
        },
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          frameRate: { ideal: 30 } 
        }
      });
      console.log('✅ Camera access granted');

      setMediaStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(e => console.warn('Play warning:', e));
      }

      // Wait a bit for video to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      if (recognition && !isListening) {
        console.log('🎤 Starting speech recognition...');
        recognition.start();
        // Don't set isListening here - wait for onstart event
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('📤 Sending start signal to backend');
        ws.send(JSON.stringify({ 
          type: 'start',
          question: question
        }));
      } else {
        console.warn('⚠️ WebSocket not ready. State:', ws?.readyState);
      }

      setIsRecording(true);
      setIsLoading(false);
      console.log('✅ Recording started successfully');

    } catch (err) {
      console.error('❌ Failed to start recording:', err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  // Stop Recording
  const stopRecording = async () => {
    try {
      console.log('🛑 Stopping recording...');
      
      if (recognition && isListening) {
        recognition.stop();
        isListening = false;
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
      }

      // Clear intervals
      if (speechTimeout) {
        clearInterval(speechTimeout);
        speechTimeout = null;
      }

      setIsRecording(false);
      setInterimTranscript('');
      console.log('✅ Recording stopped');
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err.message);
    }
  };

  const resetFeedback = () => {
    setTranscript('');
    setInterimTranscript('');
    setScore(null);
    setSuggestions([]);
    setError('');
    setRecordingTime(0);
    setShowFeedback(false);
    setEyeContactScore(0);
    setAnalysis({});
    setFaceDetected(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animation-delay-4000"></div>
      </div>

      <div className="relative z-10">
        <header className="backdrop-blur-md bg-slate-900/50 border-b border-slate-700/50 sticky top-0">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                  <Brain size={28} />
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                    Interview Coach AI
                  </h1>
                  <p className="text-sm text-slate-400">Advanced Interview Practice with Eye Contact Detection</p>
                </div>
              </div>
              <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-full ${
                isRecording ? 'bg-red-600/20 border border-red-600/50' : 'bg-slate-800/50 border border-slate-700/50'
              }`}>
                <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-400 animate-pulse' : modelsLoaded ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                <span className="text-sm text-slate-300">
                  {isRecording ? 'Recording...' : modelsLoaded ? 'Ready' : 'Loading...'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {!modelsLoaded && (
          <div className="mx-6 mt-6 bg-blue-900/50 border border-blue-600/50 rounded-xl p-4 backdrop-blur flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-blue-300 text-sm">Loading AI models (this may take 10-20 seconds on first load)...</span>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-6 bg-red-900/50 border border-red-600/50 rounded-xl p-4 backdrop-blur flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} className="text-red-400" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">✕</button>
          </div>
        )}

        <main className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="space-y-6">
                <div className="relative rounded-2xl overflow-hidden aspect-video bg-slate-800 border border-slate-700/50 shadow-2xl">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />

                  {isRecording && currentQuestion && (
                    <div className="absolute top-4 left-4 right-4 bg-blue-600/90 backdrop-blur px-6 py-4 rounded-xl border border-blue-400/50">
                      <p className="text-sm font-semibold text-blue-100 mb-2">Question:</p>
                      <p className="text-lg font-bold text-white">{currentQuestion}</p>
                    </div>
                  )}

                  {isRecording && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-900/80 backdrop-blur px-4 py-3 rounded-xl border border-slate-600/50">
                      <Eye size={18} className={eyeContactScore > 70 ? 'text-green-400' : eyeContactScore > 40 ? 'text-yellow-400' : 'text-red-400'} />
                      <div>
                        <p className="text-xs text-slate-400">Eye Contact</p>
                        <p className={`font-bold ${eyeContactScore > 70 ? 'text-green-400' : eyeContactScore > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {eyeContactScore}%
                        </p>
                      </div>
                    </div>
                  )}

                  {isRecording && (
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-slate-900/80 backdrop-blur px-4 py-2 rounded-full border border-slate-600/50">
                      <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                      <span className="text-xs text-slate-300">{faceDetected ? 'Face Detected' : 'No Face'}</span>
                    </div>
                  )}

                  {isRecording && (
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-red-500/90 backdrop-blur px-4 py-2 rounded-full animate-pulse">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                      <span className="text-sm font-semibold">{formatTime(recordingTime)}</span>
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-r from-slate-800/50 to-slate-800/30 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Video size={20} className="text-blue-400" />
                    Perfect Your Setup
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { icon: '💡', label: 'Bright Lighting', desc: 'Front-facing light' },
                      { icon: '👁️', label: 'Eye Contact', desc: 'Look at camera' },
                      { icon: '🎯', label: 'Center Frame', desc: 'Face in middle' },
                      { icon: '🎨', label: 'Plain Background', desc: 'Minimal distractions' }
                    ].map((tip, i) => (
                      <div key={i} className="bg-slate-700/40 hover:bg-slate-700/60 rounded-xl p-4 transition-all">
                        <div className="text-2xl mb-2">{tip.icon}</div>
                        <div className="font-medium text-sm text-white">{tip.label}</div>
                        <div className="text-xs text-slate-400 mt-1">{tip.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoading || !modelsLoaded}
                    className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                      isRecording
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/50'
                        : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white shadow-lg shadow-blue-600/50'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Starting...
                      </>
                    ) : isRecording ? (
                      <>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        Stop Recording
                      </>
                    ) : (
                      <>
                        <Mic size={20} />
                        Start Recording
                      </>
                    )}
                  </button>
                  {showFeedback && (
                    <button
                      onClick={resetFeedback}
                      className="py-4 px-6 rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-600/50 transition-all flex items-center gap-2"
                    >
                      <RotateCcw size={18} />
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Live Metrics</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">👁️ Eye Contact</span>
                    <span className={`font-bold ${eyeContactScore > 70 ? 'text-green-400' : eyeContactScore > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {eyeContactScore}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">⏱️ Recording</span>
                    <span className="font-bold text-cyan-400">{formatTime(recordingTime)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">📊 Status</span>
                    <span className={`font-bold ${isRecording ? 'text-red-400' : 'text-green-400'}`}>
                      {isRecording ? 'Recording' : 'Ready'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                  <Zap size={16} className="text-yellow-400" />
                  Pro Tips
                </h3>
                <ul className="space-y-3">
                  {[
                    '🎯 Maintain steady eye contact',
                    '🗣️ Speak 120-150 words/minute',
                    '✋ Avoid filler words (um, uh, like)',
                    '📈 Use action verbs & metrics'
                  ].map((tip, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {showFeedback && (
            <div className="mt-12 grid lg:grid-cols-2 gap-8">
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur border border-slate-700/50 rounded-2xl p-8">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="text-2xl">🎤</span>
                  Your Response
                </h3>
                <div className="min-h-[100px]">
                  <p className="text-slate-300 leading-relaxed">{transcript}</p>
                  {interimTranscript && (
                    <p className="text-slate-500 italic mt-2">{interimTranscript}</p>
                  )}
                  {!transcript && !interimTranscript && (
                    <p className="text-slate-500">No transcript available</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur border border-slate-700/50 rounded-2xl p-8">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                      <TrendingUp size={24} className="text-green-400" />
                      Score
                    </h3>
                    {score !== null && (
                      <div className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                        {score}
                      </div>
                    )}
                  </div>
                </div>

                {analysis && Object.keys(analysis).length > 0 && (
                  <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur border border-slate-700/50 rounded-2xl p-6">
                    <h4 className="font-semibold text-slate-200 mb-3">📊 Analysis</h4>
                    <div className="space-y-2 text-sm text-slate-300">
                      {analysis.summary && <p>📝 {analysis.summary}</p>}
                      {analysis.eyeContact && <p>👁️ {analysis.eyeContact}</p>}
                      {analysis.fillerWords && <p>🗣️ {analysis.fillerWords}</p>}
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur border border-slate-700/50 rounded-2xl p-8">
                <h4 className="font-semibold text-slate-200 mb-4">💡 Feedback</h4>
                <div className="space-y-3">
                  {suggestions.length > 0 ? (
                    suggestions.map((suggestion, i) => (
                      <div key={i} className="flex gap-3 bg-slate-700/40 rounded-lg p-3">
                        <span className="text-lg flex-shrink-0">
                          {suggestion.includes('✅') ? '✅' : suggestion.includes('⚠️') ? '⚠️' : '❌'}
                        </span>
                        <span className="text-slate-300 text-sm">{suggestion}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400">No suggestions</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;