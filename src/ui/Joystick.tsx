import { useRef, useState } from 'react';
import { useJoystickStore } from '../store/joystickStore';

const BASE_RADIUS = 50;
const KNOB_RADIUS = 25;
const KNOB_LIMIT = 40;

export default function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const setVector = useJoystickStore((s) => s.setVector);
  const reset = useJoystickStore((s) => s.reset);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, KNOB_LIMIT);
    const angle = Math.atan2(dy, dx);
    const knobX = dist > 0 ? Math.cos(angle) * clamped : 0;
    const knobY = dist > 0 ? Math.sin(angle) * clamped : 0;
    setKnobPos({ x: knobX, y: knobY });
    setVector(knobX / KNOB_LIMIT, knobY / KNOB_LIMIT);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    setKnobPos({ x: 0, y: 0 });
    reset();
  };

  return (
    <div
      ref={baseRef}
      className="joystick-base"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'fixed',
        bottom: 130,
        left: 24,
        width: BASE_RADIUS * 2,
        height: BASE_RADIUS * 2,
        borderRadius: '50%',
        background: 'rgba(20,20,35,0.5)',
        border: '2px solid #445',
        pointerEvents: 'auto',
        touchAction: 'none',
        zIndex: 25,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: KNOB_RADIUS * 2,
          height: KNOB_RADIUS * 2,
          marginLeft: -KNOB_RADIUS,
          marginTop: -KNOB_RADIUS,
          borderRadius: '50%',
          background: 'rgba(150,170,220,0.85)',
          border: '2px solid #88aaff',
          transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          transition: draggingRef.current ? 'none' : 'transform 0.15s ease-out',
        }}
      />
    </div>
  );
}
