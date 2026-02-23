import { useCallback, useEffect, useState } from 'react';
import { useAnimate } from 'framer-motion';

const GRID_SIZE = 75;

export default function GridHoverBackground() {
  const [scope, animate] = useAnimate();
  const [size, setSize] = useState({ columns: 0, rows: 0 });

  const generateGridCount = useCallback(() => {
    const columns = Math.max(1, Math.floor(window.innerWidth / GRID_SIZE));
    const rows = Math.max(1, Math.floor(window.innerHeight / GRID_SIZE));
    setSize({ columns, rows });
  }, []);

  useEffect(() => {
    generateGridCount();
    window.addEventListener('resize', generateGridCount);
    return () => window.removeEventListener('resize', generateGridCount);
  }, [generateGridCount]);

  const handleMouseEnter = (event) => {
    const id = `#${event.currentTarget.id}`;
    animate(id, { backgroundColor: '#FEDB48' }, { duration: 0.15 });
  };

  const handleMouseLeave = (event) => {
    const id = `#${event.currentTarget.id}`;
    animate(id, { backgroundColor: 'rgba(254, 219, 72, 0)' }, { duration: 1.2 });
  };

  return (
    <div className="grid-hover-background">
      <div
        ref={scope}
        className="grid-hover-layer"
        style={{
          gridTemplateColumns: `repeat(${size.columns}, minmax(${GRID_SIZE}px, 1fr))`,
          gridTemplateRows: `repeat(${size.rows}, minmax(${GRID_SIZE}px, 1fr))`,
        }}
      >
        {Array.from({ length: size.columns * size.rows }).map((_, index) => (
          <div
            key={index}
            id={`hover-square-${index}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="grid-hover-square"
          />
        ))}
      </div>
    </div>
  );
}
