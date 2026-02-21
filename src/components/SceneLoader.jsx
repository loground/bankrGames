export default function SceneLoader({ title = 'Loading...' }) {
  return (
    <div className="scene-loader">
      <div className="scene-loader-card">{title}</div>
    </div>
  );
}
