// ============================================================================
// Blockfall — i18n: плоский словарь всех пользовательских строк UI (зона SA2).
// Ключ = место в ui.ts; RU-значения — ровно те строки, что были в ui.ts.
// EN — короткий «тетрисный» английский. Никаких импортов: types.ts может
// безопасно брать отсюда тип Lang без риска цикла.
// ============================================================================
export type Lang = 'ru' | 'en';

const ru = {
  // бренд / меню
  logo: 'Blockfall',
  logoSub: 'падающие блоки',
  play: 'Играть',
  settings: 'Настройки',
  menuHigh: 'Рекорд: ',
  // HUD
  hudHold: 'Hold',
  hudNext: 'Next',
  hudRecord: 'Рекорд',
  hudLines: 'Линии',
  hudLevel: 'Ур',
  // кнопки контролов
  ctlSwap: 'Заменить',
  ctlRotate: 'Поворот',
  ctlDrop: 'Сброс',
  // пауза
  pause: 'Пауза',
  resume: 'Продолжить',
  restart: 'Начать заново',
  restartHold: 'Начать заново (удерживайте 2 секунды)',
  quitMenu: 'В меню',
  // gameover
  gameOver: 'Игра окончена',
  newRecord: 'НОВЫЙ РЕКОРД!',
  finalLines: 'Линии: ',
  finalLevel: 'Уровень: ',
  // настройки
  setMusic: 'Музыка',
  setSfx: 'Звуки',
  setHaptics: 'Вибрация',
  setLang: 'Язык',
  done: 'Готово',
  // onboarding
  obSwipeTitle: 'Свайп вбок',
  obSwipeHint: 'Двигай фигуру пальцем: ~1 клетка на 24px.',
  obTapTitle: 'Тап — поворот',
  obTapHint: 'Коснись поля, чтобы повернуть. Свайп вниз — мягкое падение.',
  obHardHint: 'Свайп резко вниз или кнопка «Сброс» — мгновенный сброс. Свайп вверх — «Заменить».',
  obNext: 'Дальше',
  obStart: 'Начать',
  obSkip: 'Пропустить',
  // ориентация
  orientMsg: 'Поверните телефон вертикально',
};

export type Dict = typeof ru;

export const I18N: Record<Lang, Dict> = {
  ru,
  en: {
    logo: 'Blockfall',
    logoSub: 'falling blocks',
    play: 'Play',
    settings: 'Settings',
    menuHigh: 'Best: ',
    hudHold: 'Hold',
    hudNext: 'Next',
    hudRecord: 'Record',
    hudLines: 'Lines',
    hudLevel: 'Lvl',
    ctlSwap: 'Swap',
    ctlRotate: 'Rotate',
    ctlDrop: 'Drop',
    pause: 'Pause',
    resume: 'Resume',
    restart: 'Restart',
    restartHold: 'Restart (hold 2 seconds)',
    quitMenu: 'Menu',
    gameOver: 'Game Over',
    newRecord: 'NEW RECORD!',
    finalLines: 'Lines: ',
    finalLevel: 'Level: ',
    setMusic: 'Music',
    setSfx: 'Sound',
    setHaptics: 'Vibration',
    setLang: 'Language',
    done: 'Done',
    obSwipeTitle: 'Swipe sideways',
    obSwipeHint: 'Move the piece with your finger: ~1 cell per 24px.',
    obTapTitle: 'Tap to rotate',
    obTapHint: 'Tap the field to rotate. Swipe down for a soft drop.',
    obHardHint: 'Swipe down fast or press Drop for an instant hard drop. Swipe up to Swap.',
    obNext: 'Next',
    obStart: 'Start',
    obSkip: 'Skip',
    orientMsg: 'Rotate your phone to portrait',
  },
};
