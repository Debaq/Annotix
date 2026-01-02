interface ClassColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export function ClassColorPicker({ color, onChange }: ClassColorPickerProps) {
  return (
    <div className="relative">
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border"
      />
    </div>
  );
}
