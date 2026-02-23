import { useProgress } from '@react-three/drei';

export default function SceneLoader({ title = 'Loading...' }) {
  const { progress } = useProgress();

  return (
    <div className="scene-loader">
      <div className="scene-loader-card">
        <div>{title}</div>
        <div className="scene-loader-progress">{Math.round(progress)}%</div>
      </div>
    </div>
  );
}
