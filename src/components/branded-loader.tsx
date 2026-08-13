interface BrandedLoaderProps {
  title: string
  message: string
  compact?: boolean
}

/** Shared, lightweight visual used by PWA startup and login transitions. */
export function BrandedLoader({ title, message, compact = false }: BrandedLoaderProps) {
  return (
    <div className={`brand-loader ${compact ? 'brand-loader--compact' : ''}`}>
      <div className="brand-loader__mark" aria-hidden="true">
        <span className="brand-loader__orbit" />
        {/* Public asset keeps the first paint independent from Next image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/logo-sistem-v2-192.png"
          alt=""
          width={96}
          height={96}
          className="brand-loader__logo"
          draggable={false}
        />
      </div>

      <div className="brand-loader__copy">
        <p className="brand-loader__title">{title}</p>
        <p className="brand-loader__message">{message}</p>
      </div>

      <div className="brand-loader__progress" aria-hidden="true">
        <span />
      </div>
      <div className="brand-loader__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
