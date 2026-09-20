export const traditions = [
  {
    id: 'ancient-greece',
    period: '约公元前 600 — 公元前 300',
    eyebrow: 'TRADITION 01',
    name: '古希腊哲学',
    english: 'Ancient Greece',
    summary: '从自然的秩序到灵魂的照料，哲学在城邦中第一次成为一种生活方式。',
    color: '#c75b3d',
    image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=85',
    philosophers: ['苏格拉底', '柏拉图', '亚里士多德'],
  },
  {
    id: 'modern',
    period: '约 1600 — 1800',
    eyebrow: 'TRADITION 02',
    name: '近代哲学',
    english: 'The Modern Turn',
    summary: '当旧秩序开始松动，理性、经验与主体意识成为寻找确定性的三条路径。',
    color: '#7d8663',
    image: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=85',
    philosophers: ['笛卡尔', '休谟', '康德'],
  },
  {
    id: 'german-idealism',
    period: '约 1780 — 1840',
    eyebrow: 'TRADITION 03',
    name: '德国古典哲学',
    english: 'German Idealism',
    summary: '主体不只是观察世界的眼睛，也参与构成世界的意义与历史。',
    color: '#bb9558',
    image: 'https://images.unsplash.com/photo-1577083552431-6e5fd01988a5?auto=format&fit=crop&w=1200&q=85',
    philosophers: ['康德', '黑格尔', '谢林'],
  },
  {
    id: 'existentialism',
    period: '约 1840 — 1970',
    eyebrow: 'TRADITION 04',
    name: '存在主义',
    english: 'Existentialism',
    summary: '自由、荒诞与责任，重新落回每一个具体的人和当下的选择。',
    color: '#536f7a',
    image: 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=1200&q=85',
    philosophers: ['克尔凯郭尔', '萨特', '加缪'],
  },
];

export const philosophers = [
  { id: 'socrates', name: '苏格拉底', latin: 'Socrates', years: '公元前 470 — 399', tradition: '古希腊哲学', slug: 'ancient-greece', quote: '未经审视的人生不值得过。', intro: '他没有留下著作，却把哲学变成了街头的对话：我们究竟知道什么？', tags: ['伦理', '对话', '城邦'] },
  { id: 'plato', name: '柏拉图', latin: 'Plato', years: '公元前 428 — 348', tradition: '古希腊哲学', slug: 'ancient-greece', quote: '思考是灵魂与自己的对话。', intro: '从洞穴寓言到理想国，柏拉图追问感官世界背后是否存在永恒的形式。', tags: ['理念', '政治', '灵魂'] },
  { id: 'aristotle', name: '亚里士多德', latin: 'Aristotle', years: '公元前 384 — 322', tradition: '古希腊哲学', slug: 'ancient-greece', quote: '幸福是灵魂合乎德性的现实活动。', intro: '他整理知识、观察自然，也为“怎样生活”提供了关于习惯与中道的实践学。', tags: ['德性', '自然', '逻辑'] },
  { id: 'zeno', name: '芝诺', latin: 'Zeno of Citium', years: '约公元前 334 — 262', tradition: '古希腊哲学', slug: 'ancient-greece', quote: '幸福来自与自然一致的生活。', intro: '斯多葛学派的奠基者，主张区分可控与不可控之事，在变化中守住内在的判断。', tags: ['斯多葛', '自然', '实践'] },
  { id: 'descartes', name: '笛卡尔', latin: 'René Descartes', years: '1596 — 1650', tradition: '近代哲学', slug: 'modern', quote: '我思，故我在。', intro: '通过普遍怀疑，笛卡尔试图找到不容置疑的起点，并以此重建知识的大厦。', tags: ['主体', '怀疑', '理性'] },
  { id: 'hume', name: '休谟', latin: 'David Hume', years: '1711 — 1776', tradition: '近代哲学', slug: 'modern', quote: '理性是、也只应当是激情的奴隶。', intro: '休谟把经验推到怀疑的边缘，提醒我们因果、道德与自我都可能比想象中更不稳固。', tags: ['经验', '怀疑', '情感'] },
  { id: 'kant', name: '康德', latin: 'Immanuel Kant', years: '1724 — 1804', tradition: '德国古典哲学', slug: 'german-idealism', quote: '有两样东西，我越思考越感到敬畏。', intro: '头顶的星空与心中的道德法则，标记了认识的边界，也标记了自由的尊严。', tags: ['批判', '道德', '自由'] },
  { id: 'hegel', name: '黑格尔', latin: 'G. W. F. Hegel', years: '1770 — 1831', tradition: '德国古典哲学', slug: 'german-idealism', quote: '凡是现实的都是合理的。', intro: '在黑格尔那里，思想与历史不是静止的图景，而是通过矛盾不断展开的过程。', tags: ['辩证法', '历史', '精神'] },
  { id: 'schelling', name: '谢林', latin: 'F. W. J. Schelling', years: '1775 — 1854', tradition: '德国古典哲学', slug: 'german-idealism', quote: '自然是可见的精神，精神是不可见的自然。', intro: '谢林试图在自然与自由之间搭桥，让自然不再只是被动的对象，而成为自我展开的力量。', tags: ['自然', '自由', '艺术'] },
  { id: 'sartre', name: '萨特', latin: 'Jean-Paul Sartre', years: '1905 — 1980', tradition: '存在主义', slug: 'existentialism', quote: '存在先于本质。', intro: '没有预设的剧本，人被抛入自由之中，也因此必须为自己的选择负责。', tags: ['自由', '他人', '责任'] },
  { id: 'heidegger', name: '海德格尔', latin: 'Martin Heidegger', years: '1889 — 1976', tradition: '存在主义', slug: 'existentialism', quote: '语言是存在之家。', intro: '海德格尔把注意力带回“存在”本身，追问我们如何在世界之中存在。', tags: ['存在', '时间', '语言'] },
  { id: 'camus', name: '加缪', latin: 'Albert Camus', years: '1913 — 1960', tradition: '存在主义', slug: 'existentialism', quote: '真正严肃的哲学问题只有一个：自杀。', intro: '面对荒诞，加缪拒绝虚无的捷径，转而寻找清醒、反抗与共同生活的可能。', tags: ['荒诞', '反抗', '团结'] },
];

export const questions = [
  { id: 'human', number: '01', title: '人是什么？', description: '从灵魂、理性到处境，关于“我们是谁”的答案从未只有一个。', route: '/question/human', accent: '#c75b3d', thinkers: ['苏格拉底', '亚里士多德', '萨特'] },
  { id: 'knowledge', number: '02', title: '知识从哪里来？', description: '经验可靠吗？理性能够抵达真理吗？', route: '/question/knowledge', accent: '#7d8663', thinkers: ['笛卡尔', '休谟', '康德'] },
  { id: 'real', number: '03', title: '什么是真实？', description: '在现象、理念与语言之间，世界以怎样的方式显现？', route: '/question/real', accent: '#bb9558', thinkers: ['柏拉图', '康德', '海德格尔'] },
  { id: 'life', number: '04', title: '怎样生活？', description: '一个值得过的人生，需要什么样的实践与勇气？', route: '/question/life', accent: '#536f7a', thinkers: ['亚里士多德', '萨特', '加缪'] },
];

export function getPhilosopher(id) { return philosophers.find((item) => item.id === id); }
export function getTradition(id) { return traditions.find((item) => item.id === id); }
