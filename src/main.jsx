import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Menu, Search, X } from 'lucide-react';
import { getPhilosopher, getTradition, philosophers, questions, traditions } from './data';
import { GalleryProvider } from './gallery/GalleryContext.jsx';
import Gallery from './gallery/Gallery.jsx';
import FigurePage from './gallery/FigurePage.jsx';
import QuestionPage from './gallery/QuestionPage.jsx';
import './styles.css';
import './gallery/gallery.css';

function useReadingLog() {
  const [log, setLog] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('philosophy-log'));
      return Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const add = (id) => setLog((current) => {
    const next = [id, ...current.filter((item) => item !== id)].slice(0, 6);
    try { localStorage.setItem('philosophy-log', JSON.stringify(next)); } catch { /* storage is optional */ }
    return next;
  });
  return { log, add };
}

function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  return <div className="app-shell">
    <header className="site-header">
      <Link className="wordmark" to="/"><span className="wordmark-mark">Φ</span><span><b>思想档案馆</b><small>WESTERN PHILOSOPHY ARCHIVE</small></span></Link>
      <button className="menu-button" aria-label="打开菜单" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
      <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'}>
        <NavLink to="/traditions">思想传统</NavLink>
        <NavLink to="/philosophers">哲学家</NavLink>
        <NavLink to="/questions">核心问题</NavLink>
        <NavLink to="/gallery">东西长廊</NavLink>
        <span className="nav-rule" />
        <span className="archive-status"><span className="status-dot" />正在开放 · 24 典藏</span>
      </nav>
    </header>
    {children}
    <footer className="site-footer"><span>THE PHILOSOPHY ARCHIVE / 01</span><span>一个面向所有人的思想入口</span><span>© 2024</span></footer>
  </div>;
}

function SectionHeading({ kicker, title, children }) { return <div className="section-heading"><div><span className="kicker">{kicker}</span><h2>{title}</h2></div>{children}</div>; }

function Home() {
  const { add } = useReadingLog();
  return <main>
    <section className="hero section-pad">
      <div className="hero-copy"><span className="kicker">A LIVING INDEX OF IDEAS / 2024</span><h1>把人生的问题，<br /><em>交还给思想。</em></h1><p className="hero-intro">西方哲学不是一座只能远观的雕像群。它是几千年来，人们围绕真实、知识与生活反复展开的对话。</p><Link className="text-link" to="/questions">从一个问题开始 <ArrowUpRight size={16} /></Link></div>
      <div className="hero-visual"><img src="https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=1400&q=90" alt="古典雕塑凝视着光线" /><div className="hero-caption"><span>FIG. 001</span><span>MARBLE HEAD, UNKNOWN / 2ND C.</span></div><div className="hero-stamp">OPEN<br /><strong>24</strong><br />ENTRIES</div></div>
    </section>

    <section className="question-band section-pad"><SectionHeading kicker="THE WAY IN" title="从一个问题开始"><span className="heading-note">点击进入一条思想路径</span></SectionHeading><div className="question-grid">{questions.map((q) => <Link key={q.id} to={q.route} className="question-item" onClick={() => add(`question:${q.id}`)} style={{ '--accent': q.accent }}><span className="question-number">{q.number}</span><div><h3>{q.title}</h3><p>{q.description}</p><span className="mini-link">探索这条路径 <ChevronRight size={14} /></span></div></Link>)}</div></section>

    <section className="timeline-band section-pad"><SectionHeading kicker="A SHORT HISTORY" title="思想的时间线"><Link className="text-link" to="/traditions">查看全部传统 <ArrowUpRight size={16} /></Link></SectionHeading><div className="timeline">{traditions.map((tradition, index) => <Link to={`/tradition/${tradition.id}`} key={tradition.id} className="timeline-entry" onClick={() => add(`tradition:${tradition.id}`)}><div className="timeline-year">{index === 0 ? '— 600' : tradition.id === 'modern' ? '1600' : tradition.id === 'german-idealism' ? '1780' : '1840'}</div><div className="timeline-line"><span className="timeline-dot" style={{ background: tradition.color }} /></div><div className="timeline-content"><span className="kicker">{tradition.eyebrow}</span><h3>{tradition.name}</h3><p>{tradition.summary}</p></div></Link>)}</div></section>

    <section className="featured-band section-pad"><SectionHeading kicker="RECENTLY ADDED" title="值得先认识的人"><span className="heading-note">六位思想的转向者</span></SectionHeading><div className="philosopher-grid">{philosophers.slice(0, 3).map((person) => <PhilosopherCard key={person.id} person={person} onOpen={() => add(`philosopher:${person.id}`)} />)}</div></section>
  </main>;
}

function PhilosopherCard({ person, onOpen }) { return <Link to={`/philosopher/${person.id}`} className="philosopher-card" onClick={onOpen}><div className="portrait-placeholder" data-initial={person.name.slice(0, 1)}><span>{person.latin}</span></div><div className="card-body"><div className="card-meta"><span>{person.years}</span><span>{person.tradition}</span></div><h3>{person.name}</h3><p>“{person.quote}”</p><span className="mini-link">阅读档案 <ArrowUpRight size={14} /></span></div></Link>; }

function Traditions() { const { add } = useReadingLog(); return <main className="page-main section-pad"><PageIntro kicker="THE TRADITIONS" title="思想不是一条直线。" intro="每一种传统都在回应前人的问题，也把新的问题交给后来者。沿着时间线，进入那些仍在发生的对话。" /><div className="tradition-list">{traditions.map((item, index) => <Link className="tradition-row" to={`/tradition/${item.id}`} key={item.id} onClick={() => add(`tradition:${item.id}`)}><div className="row-index">0{index + 1}</div><div className="row-image"><img src={item.image} alt="" /></div><div className="row-copy"><span className="kicker">{item.period}</span><h2>{item.name}</h2><p>{item.summary}</p><span className="mini-link">进入传统 <ArrowUpRight size={14} /></span></div><div className="row-arrow"><ArrowUpRight size={21} /></div></Link>)}</div></main>; }

function Philosophers() { const { add } = useReadingLog(); const [search, setSearch] = useState(''); const filtered = useMemo(() => philosophers.filter((p) => `${p.name}${p.latin}${p.tradition}`.toLowerCase().includes(search.toLowerCase())), [search]); return <main className="page-main section-pad"><PageIntro kicker="THE PHILOSOPHERS" title="与其相遇，不如对话。" intro="这些名字不是结论，而是进入一整套问题意识的坐标。" /><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索哲学家 / 传统" /><span>{filtered.length} 位</span></div><div className="philosopher-grid all-philosophers">{filtered.map((person) => <PhilosopherCard key={person.id} person={person} onOpen={() => add(`philosopher:${person.id}`)} />)}</div></main>; }

function Questions() { const { add } = useReadingLog(); return <main className="page-main section-pad"><PageIntro kicker="THE QUESTIONS" title="问题比答案更长久。" intro="把哲学带回日常，从一个你真正关心的问题开始。" /><div className="large-question-list">{questions.map((q) => <Link key={q.id} to={q.route} onClick={() => add(`question:${q.id}`)} className="large-question" style={{ '--accent': q.accent }}><span>{q.number}</span><h2>{q.title}</h2><p>{q.description}</p><ArrowUpRight size={20} /></Link>)}</div></main>; }

function PageIntro({ kicker, title, intro }) { return <div className="page-intro"><span className="kicker">{kicker}</span><h1>{title}</h1><p>{intro}</p></div>; }

function TraditionDetail() { const { id } = useParams(); const tradition = getTradition(id); const { add } = useReadingLog(); if (!tradition) return <NotFound />; const people = philosophers.filter((p) => p.slug === id); return <main className="detail-main"><section className="detail-hero section-pad" style={{ '--accent': tradition.color }}><div><span className="kicker">{tradition.eyebrow} / {tradition.period}</span><h1>{tradition.name}</h1><p>{tradition.summary}</p></div><img src={tradition.image} alt="" /></section><section className="detail-section section-pad"><SectionHeading kicker="THE NAMES IN THIS ROOM" title={`${people.length} 位入口人物`} /><div className="philosopher-grid">{people.map((person) => <PhilosopherCard person={person} key={person.id} onOpen={() => add(`philosopher:${person.id}`)} />)}</div></section></main>; }

function PhilosopherDetail() { const { id } = useParams(); const person = getPhilosopher(id); const { add } = useReadingLog(); useEffect(() => { if (person) add(`philosopher:${person.id}`); }, [person?.id]); if (!person) return <NotFound />; return <main className="detail-main"><section className="person-hero section-pad"><div className="person-portrait portrait-placeholder" data-initial={person.name.slice(0, 1)}><span>{person.latin}</span></div><div className="person-copy"><span className="kicker">{person.tradition} / {person.years}</span><h1>{person.name}</h1><p className="person-quote">“{person.quote}”</p><p>{person.intro}</p><div className="tag-row">{person.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></section><section className="reading-note section-pad"><span className="kicker">A NOTE FOR YOUR READING</span><h2>先不要急着记住他的答案。</h2><p>试着带着一个自己的问题离开。思想真正开始的时刻，往往发生在书页合上之后。</p><Link className="text-link" to="/questions">继续探索问题 <ArrowUpRight size={16} /></Link></section></main>; }

function QuestionDetail() { const { id } = useParams(); const question = questions.find((q) => q.id === id); if (!question) return <NotFound />; const relevant = philosophers.filter((p) => question.thinkers.includes(p.name)); return <main className="question-detail section-pad" style={{ '--accent': question.accent }}><Link className="back-link" to="/questions"><ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />返回问题索引</Link><div className="question-detail-head"><span className="question-number">{question.number}</span><h1>{question.title}</h1><p>{question.description}</p></div><div className="question-essay"><p className="dropcap">哲学从未只发生在书房。每一个时代都在重新发明这个问题，而每一个人也都需要在自己的生活里重新回答它。</p><p>沿着下方的人物线索阅读，你会看到不同的词语如何彼此碰撞：灵魂与身体，经验与理性，选择与责任。它们不提供一条笔直的道路，只让我们看见岔路口。</p></div><div className="question-thinkers"><span className="kicker">THINKERS TO FOLLOW</span><div>{relevant.map((person) => <Link key={person.id} to={`/philosopher/${person.id}`} className="thinker-chip"><span>{person.name}</span><ArrowUpRight size={15} /></Link>)}</div></div></main>; }

function NotFound() { return <main className="page-main section-pad"><PageIntro kicker="404" title="这页还在路上。" intro="返回档案馆，换一条路径继续。" /><Link className="text-link" to="/">回到首页 <ArrowUpRight size={16} /></Link></main>; }

function App() { return <Layout><Routes><Route path="/" element={<Home />} /><Route path="/traditions" element={<Traditions />} /><Route path="/philosophers" element={<Philosophers />} /><Route path="/questions" element={<Questions />} /><Route path="/tradition/:id" element={<TraditionDetail />} /><Route path="/philosopher/:id" element={<PhilosopherDetail />} /><Route path="/question/:id" element={<QuestionDetail />} /><Route path="/gallery" element={<GalleryProvider><Gallery /></GalleryProvider>} /><Route path="/gallery/figure/:id" element={<GalleryProvider><FigurePage /></GalleryProvider>} /><Route path="/gallery/question/:id" element={<GalleryProvider><QuestionPage /></GalleryProvider>} /><Route path="*" element={<NotFound />} /></Routes></Layout>; }

createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
