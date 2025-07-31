import { useState, useEffect, useRef } from 'react'
import './App.css'

type TimerMode = 'work' | 'rest'
type TimerState = 'idle' | 'running' | 'paused'

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionError extends Event {
  error: string
}

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

function App() {
  const [workTime, setWorkTime] = useState(() => {
    const saved = localStorage.getItem('workTime')
    return saved ? parseInt(saved) : 5
  })
  const [restTime, setRestTime] = useState(() => {
    const saved = localStorage.getItem('restTime')
    return saved ? parseInt(saved) : 5
  })
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = localStorage.getItem('workTime')
    return saved ? parseInt(saved) : 5
  })
  const [timerMode, setTimerMode] = useState<TimerMode>('work')
  const [timerState, setTimerState] = useState<TimerState>('idle')
  const [soundPermission, setSoundPermission] = useState(false)
  const [voicePermission, setVoicePermission] = useState(false)
  const [recognizedText, setRecognizedText] = useState('')
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wakeLockRef = useRef<any>(null)
  const recognitionRef = useRef<any>(null)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    audioRef.current = new Audio('/bell.mp3')
    
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }
    
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
      }
    }
  }, [])

  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev <= 1) {
            playSound()
            if (timerMode === 'work') {
              setTimerMode('rest')
              return restTime
            } else {
              setTimerMode('work')
              return workTime
            }
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [timerState, timerMode, workTime, restTime])

  // Voice command handler
  useEffect(() => {
    if (recognizedText.includes('ファイトスタート')) {
      if (timerState !== 'running') {
        handleStart()
      }
    } else if (recognizedText.includes('ファイトポーズ')) {
      if (timerState === 'running') {
        handleStart() // This toggles to pause
      }
    } else if (recognizedText.includes('ファイトリセット')) {
      handleReset()
    }
  }, [recognizedText])

  const playSound = async () => {
    if (audioRef.current && soundPermission) {
      try {
        // Stop current playback and reset
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        await audioRef.current.play()
      } catch (err) {
        console.error('Failed to play sound:', err)
      }
    }
  }

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch (err) {
        console.error('Wake Lock error:', err)
      }
    }
  }

  const initSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'ja-JP'
      recognition.continuous = true
      recognition.interimResults = true
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const last = event.results.length - 1
        const text = event.results[last][0].transcript
        setRecognizedText(text)
      }
      
      recognition.onerror = (event: SpeechRecognitionError) => {
        if (event.error === 'no-speech') {
          recognition.stop()
          recognition.start()
        }
      }
      
      recognition.onend = () => {
        if (timerState === 'running') {
          recognition.start()
        }
      }
      
      recognitionRef.current = recognition
      setVoicePermission(true)
      
      try {
        recognition.start()
      } catch (err) {
        console.error('Speech recognition error:', err)
      }
    }
  }

  const handleStart = async () => {
    if (timerState === 'idle') {
      // First time start
      setSoundPermission(true)
      await requestWakeLock()
      initSpeechRecognition()
      // Play sound after setting permission
      setTimeout(() => playSound(), 100)
    }
    
    if (timerState === 'running') {
      setTimerState('paused')
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    } else {
      setTimerState('running')
      if (recognitionRef.current && voicePermission) {
        try {
          recognitionRef.current.start()
        } catch (err) {
          console.error('Failed to restart recognition:', err)
        }
      }
    }
  }

  const handleReset = () => {
    setTimerState('idle')
    setTimerMode('work')
    setCurrentTime(workTime)
    setRecognizedText('')
    
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  const adjustWorkTime = (delta: number) => {
    const newTime = Math.max(5, workTime + delta)
    setWorkTime(newTime)
    localStorage.setItem('workTime', newTime.toString())
    if (timerState === 'idle' && timerMode === 'work') {
      setCurrentTime(newTime)
    }
  }

  const adjustRestTime = (delta: number) => {
    const newTime = Math.max(5, restTime + delta)
    setRestTime(newTime)
    localStorage.setItem('restTime', newTime.toString())
    if (timerState === 'idle' && timerMode === 'rest') {
      setCurrentTime(newTime)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={`app ${isPortrait ? 'portrait' : 'landscape'}`}>
      {isPortrait ? (
        <>
          <img src="/logo.png" alt="Logo" className="logo" />
          <div className={`timer ${timerMode}`}>
            {formatTime(currentTime)}
          </div>
          <div className="controls">
            <button onClick={handleStart} className="control-button">
              {timerState === 'idle' ? 'START' : timerState === 'running' ? 'PAUSE' : 'RESUME'}
            </button>
            <button onClick={handleReset} className="control-button">
              RESET
            </button>
          </div>
          <div className="settings">
            <div className="setting-item">
              <span>Work Time</span>
              <div className="setting-controls">
                <button onClick={() => adjustWorkTime(-5)}>-</button>
                <span>{workTime}s</span>
                <button onClick={() => adjustWorkTime(5)}>+</button>
              </div>
            </div>
            <div className="setting-item">
              <span>Rest Time</span>
              <div className="setting-controls">
                <button onClick={() => adjustRestTime(-5)}>-</button>
                <span>{restTime}s</span>
                <button onClick={() => adjustRestTime(5)}>+</button>
              </div>
            </div>
          </div>
          <div className="permissions">
            <div className={`permission ${soundPermission ? 'active' : ''}`}>SOUND</div>
            <div className={`permission ${voicePermission ? 'active' : ''}`}>VOICE</div>
          </div>
          <div className="speech-result">{recognizedText}</div>
        </>
      ) : (
        <>
          <img src="/logo.png" alt="Logo" className="logo" />
          <div className="right-content">
            <div className={`timer ${timerMode}`}>
              {formatTime(currentTime)}
            </div>
            <div className="controls">
              <button onClick={handleStart} className="control-button">
                {timerState === 'idle' ? 'START' : timerState === 'running' ? 'PAUSE' : 'RESUME'}
              </button>
              <button onClick={handleReset} className="control-button">
                RESET
              </button>
            </div>
            <div className="settings">
              <div className="setting-item">
                <span>Work Time</span>
                <div className="setting-controls">
                  <button onClick={() => adjustWorkTime(-5)}>-</button>
                  <span>{workTime}s</span>
                  <button onClick={() => adjustWorkTime(5)}>+</button>
                </div>
              </div>
              <div className="setting-item">
                <span>Rest Time</span>
                <div className="setting-controls">
                  <button onClick={() => adjustRestTime(-5)}>-</button>
                  <span>{restTime}s</span>
                  <button onClick={() => adjustRestTime(5)}>+</button>
                </div>
              </div>
            </div>
            <div className="permissions">
              <div className={`permission ${soundPermission ? 'active' : ''}`}>SOUND</div>
              <div className={`permission ${voicePermission ? 'active' : ''}`}>VOICE</div>
            </div>
            <div className="speech-result">{recognizedText}</div>
          </div>
        </>
      )}
    </div>
  )
}

export default App