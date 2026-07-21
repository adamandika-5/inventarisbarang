'use client'

import { useState, forwardRef, InputHTMLAttributes } from 'react'

export interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  toggleId?: string
}

function EyeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  )
}

function EyeOffIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.03 10.03 0 014.122-.963c4.478 0 8.268 2.943 9.542 7a9.97 9.97 0 01-2.49 4.15m-1.74 1.74A9.954 9.954 0 0112 17c-.85 0-1.677-.107-2.472-.308M15 12a3 3 0 11-6 0 3 3 0 016 0zm-7.071 7.071l14.142-14.142"
      />
    </svg>
  )
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = '', disabled, id, toggleId, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    const toggleShowPassword = () => {
      if (!disabled) {
        setShowPassword((prev) => !prev)
      }
    }

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={id}
          type={showPassword ? 'text' : 'password'}
          disabled={disabled}
          className={`${className} pr-10`.trim()}
        />
        <button
          id={toggleId ?? (id ? `${id}-toggle` : undefined)}
          type="button"
          tabIndex={0}
          disabled={disabled}
          onClick={toggleShowPassword}
          aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          aria-pressed={showPassword}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:text-gray-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
export default PasswordInput
