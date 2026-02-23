import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import SceneLoader from './components/SceneLoader';
import GridHoverBackground from './components/GridHoverBackground';
import FlappyGameScene, { FlappyCameraRig } from './scenes/FlappyScene';
import { CrossyGameScene, CrossyMenuCamera, CrossyMenuScene } from './scenes/CrossyScene';
import MainMenuScene from './scenes/MainMenuScene';

export default function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);
  const menuMusicRef = useRef(null);
  const [isMenuMusicPlaying, setIsMenuMusicPlaying] = useState(false);

  const [phase, setPhase] = useState('ready');
  const [score, setScore] = useState(0);

  const [crossyMode, setCrossyMode] = useState('menu');
  const [crossyScore, setCrossyScore] = useState(0);
  const [crossyLevel, setCrossyLevel] = useState(1);
  const [crossyRunKey, setCrossyRunKey] = useState(0);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const canvasCamera = useMemo(
    () => ({ position: [0, 0, isMobile ? 10 : 8], fov: 44 }),
    [isMobile]
  );
  const canvasDpr = isMobile ? 1 : 1.25;

  const hudMessage = useMemo(() => {
    if (phase === 'ready') {
      return 'Click or press Space to start';
    }

    if (phase === 'gameover') {
      return 'Game over - click or press Space to restart';
    }

    return 'Keep flying';
  }, [phase]);

  useEffect(() => {
    if (crossyMode !== 'levelup') {
      return undefined;
    }

    const timer = setTimeout(() => {
      setCrossyLevel((value) => value + 1);
      setCrossyRunKey((value) => value + 1);
      setCrossyMode('playing');
    }, 900);

    return () => clearTimeout(timer);
  }, [crossyMode]);

  useEffect(() => {
    const audio = new Audio('/mainSong.mp3');
    audio.loop = true;
    audio.volume = 0.45;
    menuMusicRef.current = audio;

    return () => {
      audio.pause();
      menuMusicRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = menuMusicRef.current;
    if (!audio) {
      return;
    }

    if (selectedGame === null) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => setIsMenuMusicPlaying(true)).catch(() => setIsMenuMusicPlaying(false));
      } else {
        setIsMenuMusicPlaying(true);
      }
      return;
    }

    audio.pause();
    setIsMenuMusicPlaying(false);
  }, [selectedGame]);

  const playMenuMusic = () => {
    const audio = menuMusicRef.current;
    if (!audio) {
      return;
    }

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => setIsMenuMusicPlaying(true)).catch(() => setIsMenuMusicPlaying(false));
    } else {
      setIsMenuMusicPlaying(true);
    }
  };

  const stopMenuMusic = () => {
    const audio = menuMusicRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setIsMenuMusicPlaying(false);
  };

  return (
    <div className="app">
      {selectedGame === null && (
        <>
          <GridHoverBackground />
          <Suspense fallback={<SceneLoader title="Loading Main Menu..." />}>
            <Canvas
              className="main-menu-canvas"
              camera={{ position: [0, 0, 7], fov: 42 }}
              dpr={canvasDpr}
              gl={{ alpha: true, antialias: true }}
            >
              <MainMenuScene isMobile={isMobile} />
            </Canvas>
          </Suspense>

          <div className="selection-screen">
            <img className="selection-top-image" src="/bgMainPage.png" alt="Main page banner" />
            <div className="selection-title">Select game</div>
            <button className="game-option" type="button" onClick={() => setSelectedGame('flappy')}>
              Flappy Bankr
            </button>
            <button
              className="game-option"
              type="button"
              onClick={() => {
                setCrossyMode('menu');
                setCrossyScore(0);
                setCrossyLevel(1);
                setSelectedGame('crossy');
              }}
            >
              Crossy X
            </button>
          </div>
          <div className="main-audio-controls">
            <button className="mini-control" type="button" onClick={stopMenuMusic}>
              Stop
            </button>
            <button className="mini-control" type="button" onClick={playMenuMusic}>
              {isMenuMusicPlaying ? 'Playing' : 'Play'}
            </button>
          </div>
        </>
      )}

      {selectedGame === 'crossy' && (
        <>
          <Suspense fallback={<SceneLoader title="Loading Crossy X..." />}>
            <Canvas camera={canvasCamera} dpr={canvasDpr}>
              <color attach="background" args={['#835DEA']} />
              {crossyMode === 'menu' ? (
                <>
                  <CrossyMenuCamera />
                  <CrossyMenuScene />
                </>
              ) : (
                <CrossyGameScene
                  key={crossyRunKey}
                  mode={crossyMode}
                  setMode={setCrossyMode}
                  score={crossyScore}
                  setScore={setCrossyScore}
                  level={crossyLevel}
                  onLevelComplete={() => {
                    setCrossyScore((value) => value + 10);
                  }}
                />
              )}
            </Canvas>
          </Suspense>

          {crossyMode === 'menu' && (
            <div className="crossy-menu">
              <div className="selection-title">Crossy X</div>
              <div className="crossy-subtitle">Menu</div>
              <button
                className="game-option"
                type="button"
                onClick={() => {
                  setCrossyScore(0);
                  setCrossyLevel(1);
                  setCrossyRunKey((value) => value + 1);
                  setCrossyMode('playing');
                }}
              >
                Play
              </button>
              <button className="game-option" type="button" onClick={() => setSelectedGame(null)}>
                Back
              </button>
            </div>
          )}

          {crossyMode !== 'menu' && (
            <div className="crossy-hud">
              <div className="score">
                Level: {crossyLevel} | Score: {crossyScore}
              </div>
              {crossyMode === 'playing' && <div className="message">Move with Arrow keys/WASD or swipe</div>}
              {crossyMode === 'levelup' && <div className="message">Level complete! Next level...</div>}
              {crossyMode === 'gameover' && (
                <div className="crossy-gameover">
                  <div className="crossy-gameover-title">Game Over</div>
                  <div className="crossy-gameover-score">Level: {crossyLevel}</div>
                  <div className="crossy-gameover-score">Score: {crossyScore}</div>
                  <button
                    className="game-option"
                    type="button"
                    onClick={() => {
                      setCrossyScore(0);
                      setCrossyLevel(1);
                      setCrossyRunKey((value) => value + 1);
                      setCrossyMode('playing');
                    }}
                  >
                    Restart
                  </button>
                  <button className="game-option" type="button" onClick={() => setCrossyMode('menu')}>
                    Back to Menu
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedGame === 'flappy' && (
        <>
          <div className="flappy-back">
            <button
              className="game-option"
              type="button"
              onClick={() => {
                setSelectedGame(null);
                setPhase('ready');
                setScore(0);
              }}
            >
              Back
            </button>
          </div>

          {phase === 'ready' && (
            <div className="game-title">
              <img src="/name.png" alt="Game title" />
            </div>
          )}

          <Suspense fallback={<SceneLoader title="Loading Flappy Bankr..." />}>
            <Canvas camera={canvasCamera} dpr={canvasDpr}>
              <color attach="background" args={['#835DEA']} />
              <FlappyCameraRig phase={phase} isMobile={isMobile} />
              <FlappyGameScene phase={phase} setPhase={setPhase} score={score} setScore={setScore} />
            </Canvas>
          </Suspense>

          <div className="hud">
            {phase !== 'gameover' && <div className="score">Score: {score}</div>}
            <div className="message">{hudMessage}</div>
            {phase === 'gameover' && <div className="gameover-score">Score: {score}</div>}
          </div>
        </>
      )}
    </div>
  );
}
