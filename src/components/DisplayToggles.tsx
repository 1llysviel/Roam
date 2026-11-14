import { useEdit } from '../lib/draft';
import type { Prefs } from '../lib/draft';

const ITEMS: Array<[keyof Prefs, string]> = [
  ['showCandidates', '显示候选项'],
  ['showLegs', '显示交通段'],
  ['criticalOnly', '只看关键项'],
  ['showEnglish', '显示英文名'],
];

/** 显示开关：只影响本设备的显示，自动保存在浏览器。 */
export default function DisplayToggles() {
  const { prefs, setPrefs } = useEdit();
  return (
    <div className="toggles" role="group" aria-label="显示设置（保存在本设备）">
      {ITEMS.map(([k, label]) => (
        <label key={k} className="switch">
          <input type="checkbox" role="switch" checked={prefs[k]} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} />
          <span className="switch-track" aria-hidden="true" />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
