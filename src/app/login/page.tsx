import type { Metadata } from 'next'
import Image from 'next/image'
import LoginForm from './login-form'
import ThemeToggle from '@/components/theme-toggle'

export const metadata: Metadata = {
  title: 'Masuk — Inventaris Barang BPS Kota Mojokerto',
  description: 'Masuk ke sistem pengelolaan inventaris barang BPS Kota Mojokerto',
}

/** Ilustrasi petugas pendataan inventaris — v2 aset lokal */
function InventoryIllustration({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/illustrations/petugas-pendataan-inventaris-v2.png"
      alt="Petugas Pendataan Inventaris"
      aria-hidden="true"
      className={`object-contain ${className}`}
      draggable={false}
    />
  )
}

export default function LoginPage() {
  return (
    // ══ Main Page Background ══
    // Mobile (<1024px): Seamless full-screen background
    // Desktop (>=1024px): Soft bluish-grey background (#EEF3F8) with outer page padding
    <main className="flex min-h-dvh w-full items-center justify-center bg-white p-0 text-slate-900 dark:bg-[#101D31] dark:text-white lg:bg-[#EEF3F8] lg:px-7 lg:py-3.5 lg:dark:bg-[#070d18]">

      {/* ══ Outer Card Container ══ */}
      {/* Mobile (<1024px): Borderless, shadowless full-screen layout (no card layer) */}
      {/* Desktop (>=1024px): Big white card with 40px radius, 16px inner padding, 1px border, soft shadow */}
      <div className="flex min-h-dvh w-full flex-col bg-white p-0 dark:bg-[#101D31] lg:min-h-[calc(100dvh-28px)] lg:max-w-[1440px] lg:flex-row lg:items-stretch lg:rounded-[40px] lg:border lg:border-slate-200/80 lg:bg-white lg:p-4 lg:shadow-xl lg:shadow-slate-900/5 lg:dark:border-white/10 lg:dark:bg-[#101D31]">

        {/* ── Panel Kiri: Navy Card dengan Radius 32px ── */}
        <div className="flex shrink-0 p-3 sm:p-4 lg:w-[48%] lg:p-0 xl:w-[50%]">
          <section
            className="
              relative flex h-full w-full flex-col justify-between overflow-hidden
              rounded-[24px] bg-gradient-to-br from-[#173556] via-[#1e4770] to-[#216394]
              p-5 text-white shadow-sm sm:p-6 lg:rounded-[32px] lg:p-7 xl:p-8
            "
          >
            {/* Ornamen latar halus */}
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-white/[0.04]" />

            {/* Header Identitas Panel Kiri */}
            <div className="relative z-10 flex shrink-0 items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                  Sistem Persediaan &amp; ATK
                </p>
                <h2 className="mt-0.5 text-base font-bold leading-tight text-white lg:text-lg">
                  Inventaris Barang
                </h2>
                <p className="text-xs font-medium text-white/70">
                  BPS Kota Mojokerto
                </p>
              </div>
              <ThemeToggle className="rounded-full bg-white/10 text-white/90 hover:bg-white/15 hover:text-white lg:hidden" />
            </div>

            {/* Tagline & Deskripsi (Desktop) */}
            <div className="relative z-10 my-auto hidden pt-3 lg:block">
              <h3 className="text-[clamp(1.5rem,2.1vw,2.4rem)] font-bold leading-[1.15] tracking-[-0.03em] text-white">
                Kelola inventaris lebih mudah.
              </h3>
              <div className="mt-2.5 h-1 w-20 rounded-full bg-cyan-300/80" />
              <p className="mt-2.5 max-w-[340px] text-xs leading-relaxed text-white/80 xl:text-sm">
                Pantau stok, transaksi, dan laporan barang dalam satu dashboard yang rapi.
              </p>
            </div>

            {/* Ilustrasi Petugas Pendataan Inventaris V2 (Utuh dari Gambar 1) */}
            <div className="relative z-10 mt-auto hidden items-end justify-center px-2 pb-1 pt-2 sm:flex">
              <InventoryIllustration
                className="
                  h-auto max-h-[40vh] w-auto max-w-[90%]
                  drop-shadow-[0_12px_24px_rgba(7,25,45,0.25)]
                  xl:max-h-[44vh] xl:max-w-[92%]
                "
              />
            </div>
          </section>
        </div>

        {/* ── Panel Kanan: Formulir Login ── */}
        <section
          className="
            relative flex flex-1 flex-col items-center justify-center
            px-4 py-5 sm:px-8 sm:py-6 lg:px-8 lg:py-6
          "
        >
          {/* ThemeToggle Desktop pojok kanan atas */}
          <div className="absolute right-6 top-6 hidden lg:block">
            <ThemeToggle className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" />
          </div>

          <div className="flex w-full max-w-[380px] flex-col items-center text-center">
            {/* Logo Sistem Transparan di atas 'Selamat Datang' */}
            <Image
              src="/branding/logo-sistem-v2.png"
              alt="Logo Inventaris Barang BPS Kota Mojokerto"
              width={80}
              height={80}
              className="mb-2.5 h-16 w-16 object-contain drop-shadow-sm sm:mb-3 sm:h-20 sm:w-20"
              priority
              unoptimized
            />

            {/* Judul & Keterangan */}
            <h1 className="text-2xl font-bold tracking-[-0.03em] text-slate-950 dark:text-white sm:text-3xl">
              Selamat Datang
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">
              Masuk menggunakan akun yang telah diberikan administrator.
            </p>

            {/* Form Login */}
            <div className="mt-5 w-full text-left sm:mt-6">
              <LoginForm />
            </div>

            {/* Pemisah & Copyright Tunggal (Hanya di bawah form) */}
            <div className="mt-5 flex w-full items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              &copy; 2026 BPS Kota Mojokerto &times; Kel 12 Prodi SISFO UNIPDU
            </p>
          </div>
        </section>

      </div>
    </main>
  )
}
