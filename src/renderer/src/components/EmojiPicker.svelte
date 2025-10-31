<script lang="ts">
  interface Props {
    value?: string;
    onselect: (emoji: string) => void;
  }

  let { value = $bindable(''), onselect }: Props = $props();

  let searchQuery = $state('');
  let isOpen = $state(false);

  // Emoji to keywords mapping for better search
  const emojiKeywords: Record<string, string> = {
    '📝': 'memo note writing pencil',
    '📚': 'books library reading study',
    '💡': 'idea light bulb bright',
    '⚡': 'lightning bolt energy power fast',
    '🎯': 'target goal dart aim',
    '✅': 'check mark done complete',
    '📌': 'pin pushpin tack',
    '🔖': 'bookmark tag',
    '📋': 'clipboard list todo',
    '📊': 'chart graph data analytics',
    '✨': 'sparkle shine star magic',
    '🔥': 'fire flame hot',
    '💎': 'gem diamond jewel',
    '🎨': 'art palette paint color',
    '🎭': 'theater mask drama',
    '🎪': 'circus tent',
    '🎬': 'movie film clapper',
    '🎵': 'music note',
    '🎼': 'music score',
    '🎹': 'piano keyboard music',
    '🎸': 'guitar music',
    '🎺': 'trumpet music',
    '🎷': 'saxophone music',
    '🥁': 'drum music',
    '🎤': 'microphone music sing',
    '📖': 'book open reading',
    '📕': 'book red closed',
    '📔': 'book orange notebook',
    '📓': 'book notebook',
    '📒': 'book ledger',
    '📃': 'page document paper',
    '📜': 'scroll paper parchment',
    '📄': 'page document',
    '📰': 'newspaper news',
    '📑': 'bookmark tabs',
    '📈': 'chart increasing graph up',
    '📉': 'chart decreasing graph down',
    '💼': 'briefcase work business',
    '📁': 'folder file directory',
    '📂': 'folder open file',
    '📅': 'calendar date',
    '📆': 'calendar tear-off date',
    '💻': 'laptop computer',
    '⌨️': 'keyboard typing',
    '🖥️': 'desktop computer monitor',
    '🌱': 'seedling plant grow',
    '🌿': 'herb plant leaf',
    '🍀': 'clover lucky four leaf',
    '🌸': 'flower blossom cherry',
    '🌺': 'hibiscus flower',
    '🌻': 'sunflower flower',
    '🌼': 'blossom flower',
    '🌷': 'tulip flower',
    '🌹': 'rose flower',
    '🌲': 'tree evergreen pine',
    '🌳': 'tree deciduous',
    '🌴': 'palm tree tropical',
    '🌵': 'cactus desert',
    '🍃': 'leaf fluttering wind',
    '🍂': 'leaf autumn fall',
    '🍁': 'maple leaf autumn fall',
    '🍄': 'mushroom',
    '🌰': 'chestnut',
    '🌊': 'wave water ocean',
    '💧': 'droplet water',
    '☀️': 'sun sunny bright',
    '⭐': 'star',
    '🌙': 'moon night',
    '🌈': 'rainbow colorful',
    '❄️': 'snowflake snow cold winter',
    '🍎': 'apple fruit red',
    '🍊': 'orange fruit tangerine',
    '🍋': 'lemon fruit yellow',
    '🍌': 'banana fruit yellow',
    '🍉': 'watermelon fruit',
    '🍇': 'grapes fruit purple',
    '🍓': 'strawberry fruit red',
    '🍒': 'cherry fruit red',
    '🍑': 'peach fruit',
    '🍍': 'pineapple fruit tropical',
    '🥝': 'kiwi fruit green',
    '🍅': 'tomato vegetable red',
    '🥑': 'avocado vegetable green',
    '🍆': 'eggplant vegetable purple',
    '🌽': 'corn vegetable',
    '🥒': 'cucumber vegetable green',
    '🍞': 'bread loaf',
    '🥐': 'croissant pastry',
    '☕': 'coffee hot beverage',
    '🍵': 'tea beverage hot',
    '⚽': 'soccer ball football sport',
    '🏀': 'basketball sport',
    '🏈': 'football sport american',
    '⚾': 'baseball sport',
    '🎾': 'tennis sport',
    '🏐': 'volleyball sport',
    '🎱': 'pool billiards 8 ball',
    '🏓': 'ping pong table tennis',
    '🎯': 'bullseye target dart',
    '🎮': 'game controller video gaming',
    '🎲': 'dice game',
    '🎰': 'slot machine casino',
    '🎳': 'bowling sport',
    '🚗': 'car automobile vehicle',
    '🚕': 'taxi cab vehicle',
    '🚙': 'suv vehicle',
    '🚌': 'bus vehicle',
    '🚎': 'trolleybus vehicle',
    '🚓': 'police car vehicle',
    '🚑': 'ambulance vehicle emergency',
    '🚒': 'fire truck vehicle emergency',
    '🚚': 'truck vehicle delivery',
    '🚛': 'truck vehicle semi',
    '🚲': 'bicycle bike',
    '✈️': 'airplane plane flight travel',
    '🚀': 'rocket space launch',
    '🛸': 'ufo flying saucer alien',
    '🚢': 'ship boat cruise',
    '⛵': 'sailboat boat',
    '⚓': 'anchor ship boat',
    '🏰': 'castle fortress',
    '🏯': 'japanese castle',
    '🏁': 'checkered flag racing finish',
    '🚩': 'red flag warning',
    '🎌': 'crossed flags japan',
    '🏴': 'black flag pirate',
    '🏳️': 'white flag surrender'
  };

  const emojiCategories = {
    'Frequently Used': ['📝', '📚', '💡', '⚡', '🎯', '✅', '📌', '🔖', '📋', '📊'],
    Symbols: [
      '💡',
      '⚡',
      '✨',
      '🔥',
      '💎',
      '🎯',
      '🎨',
      '🎭',
      '🎪',
      '🎬',
      '🎵',
      '🎼',
      '🎹',
      '🎸',
      '🎺',
      '🎷',
      '🥁',
      '🎤'
    ],
    Objects: [
      '📝',
      '📚',
      '📖',
      '📕',
      '📔',
      '📓',
      '📒',
      '📃',
      '📜',
      '📄',
      '📰',
      '📑',
      '🔖',
      '📋',
      '📊',
      '📈',
      '📉',
      '💼',
      '📁',
      '📂',
      '🗂️',
      '📅',
      '📆',
      '🗓️',
      '📇',
      '🗃️',
      '🗄️',
      '🗑️',
      '💻',
      '⌨️',
      '🖥️',
      '🖨️',
      '🖱️',
      '🖲️',
      '💾',
      '💿',
      '📀',
      '🎥',
      '🎬',
      '📷',
      '📸',
      '📹',
      '📼',
      '🔍',
      '🔎',
      '🔬',
      '🔭',
      '📡',
      '🕯️',
      '💡',
      '🔦',
      '🏮',
      '📗',
      '📘',
      '📙'
    ],
    Nature: [
      '🌱',
      '🌿',
      '🍀',
      '🌸',
      '🌺',
      '🌻',
      '🌼',
      '🌷',
      '🌹',
      '🥀',
      '🌲',
      '🌳',
      '🌴',
      '🌵',
      '🌾',
      '🍃',
      '🍂',
      '🍁',
      '🍄',
      '🌰',
      '🌊',
      '💧',
      '☀️',
      '⭐',
      '🌙',
      '⛈️',
      '🌈',
      '🔥',
      '❄️'
    ],
    Food: [
      '🍎',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🫐',
      '🍈',
      '🍒',
      '🍑',
      '🥭',
      '🍍',
      '🥥',
      '🥝',
      '🍅',
      '🥑',
      '🍆',
      '🌽',
      '🌶️',
      '🫑',
      '🥒',
      '🥬',
      '🥦',
      '🍄',
      '🥜',
      '🌰',
      '🍞',
      '🥐',
      '🥖',
      '🥨',
      '🥯',
      '🧀',
      '🥚',
      '☕',
      '🍵',
      '🧃',
      '🥤'
    ],
    Activities: [
      '⚽',
      '🏀',
      '🏈',
      '⚾',
      '🥎',
      '🎾',
      '🏐',
      '🏉',
      '🥏',
      '🎱',
      '🏓',
      '🏸',
      '🥅',
      '🏒',
      '🏑',
      '🥍',
      '🏏',
      '🪃',
      '🥊',
      '🥋',
      '⛳',
      '⛸️',
      '🎿',
      '⛷️',
      '🏂',
      '🪂',
      '🏋️',
      '🤸',
      '🤺',
      '🤾',
      '🎯',
      '🎮',
      '🎲',
      '🎰',
      '🎳'
    ],
    Travel: [
      '🚗',
      '🚕',
      '🚙',
      '🚌',
      '🚎',
      '🏎️',
      '🚓',
      '🚑',
      '🚒',
      '🚐',
      '🚚',
      '🚛',
      '🚜',
      '🛴',
      '🚲',
      '🛵',
      '🏍️',
      '🛺',
      '🚔',
      '🚍',
      '🚘',
      '🚖',
      '🚡',
      '🚠',
      '🚟',
      '🚃',
      '🚋',
      '🚝',
      '🚄',
      '🚅',
      '🚈',
      '🚂',
      '🚆',
      '🚇',
      '🚊',
      '🚉',
      '✈️',
      '🛫',
      '🛬',
      '🛩️',
      '💺',
      '🚁',
      '🛸',
      '🚀',
      '🛰️',
      '🚢',
      '⛵',
      '🛶',
      '⛴️',
      '🛳️',
      '⚓',
      '🏰',
      '🏯',
      '🗾',
      '⛩️',
      '🏛️'
    ],
    Flags: ['🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️']
  };

  const allEmojis = [...new Set(Object.values(emojiCategories).flat())];

  let filteredEmojis = $derived(
    searchQuery.trim() === ''
      ? emojiCategories
      : {
          'Search Results': allEmojis.filter((emoji) => {
            const keywords = emojiKeywords[emoji] || '';
            return keywords.toLowerCase().includes(searchQuery.toLowerCase());
          })
        }
  );

  function selectEmoji(emoji: string): void {
    value = emoji;
    onselect(emoji);
    isOpen = false;
    searchQuery = '';
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      isOpen = false;
      searchQuery = '';
    }
  }

  function togglePicker(): void {
    isOpen = !isOpen;
    if (!isOpen) {
      searchQuery = '';
    }
  }
</script>

<div class="emoji-picker-container">
  <button type="button" class="emoji-button" onclick={togglePicker}>
    {value || '😀'} <span class="arrow">{isOpen ? '▲' : '▼'}</span>
  </button>

  {#if isOpen}
    <div class="emoji-picker-dropdown" onkeydown={handleKeydown}>
      <div class="search-box">
        <input
          type="text"
          placeholder="Search emoji..."
          bind:value={searchQuery}
          class="search-input"
        />
      </div>

      <div class="emoji-categories">
        {#each Object.entries(filteredEmojis) as [category, emojis] (category)}
          <div class="emoji-category">
            <div class="category-name">{category}</div>
            <div class="emoji-grid">
              {#each emojis as emoji (emoji)}
                <button
                  type="button"
                  class="emoji-item"
                  onclick={() => selectEmoji(emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .emoji-picker-container {
    position: relative;
    display: inline-block;
  }

  .emoji-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    font-size: 20px;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .emoji-button:hover {
    background: var(--bg-hover);
    border-color: var(--border-medium);
  }

  .arrow {
    font-size: 10px;
    color: var(--text-muted);
  }

  .emoji-picker-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1000;
    min-width: 320px;
    max-width: 400px;
    max-height: 400px;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .search-box {
    position: sticky;
    top: 0;
    padding: 12px;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-medium);
    z-index: 1;
  }

  .search-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--border-medium);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
  }

  .search-input:focus {
    border-color: var(--accent-primary);
  }

  .emoji-categories {
    padding: 8px;
  }

  .emoji-category {
    margin-bottom: 16px;
  }

  .category-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
    gap: 4px;
  }

  .emoji-item {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .emoji-item:hover {
    background: var(--bg-hover);
    transform: scale(1.1);
  }

  .emoji-item:active {
    transform: scale(0.95);
  }
</style>
