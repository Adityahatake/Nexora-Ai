import { EmbroideryBackdrop, PaisleyBand } from '@/components/decor'
import Nav from '@/sections/Nav'
import Hero from '@/sections/Hero'
import HowItWorks from '@/sections/HowItWorks'
import Studio from '@/sections/Studio'
import Faq from '@/sections/Faq'
import Footer from '@/sections/Footer'

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <EmbroideryBackdrop />
      <Nav />
      <main className="relative">
        <Hero />
        <PaisleyBand className="opacity-50" />
        <HowItWorks />
        <PaisleyBand flip className="opacity-40" />
        <Studio />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
