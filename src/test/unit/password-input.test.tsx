import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { PasswordInput } from '@/components/password-input'

describe('PasswordInput Component', () => {
  it('renders input with type="password" by default', () => {
    render(<PasswordInput id="test-password" name="password" data-testid="pass-input" />)

    const input = screen.getByTestId('pass-input') as HTMLInputElement
    expect(input.type).toBe('password')

    const button = screen.getByRole('button', { name: 'Tampilkan kata sandi' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles input type to "text" when eye button is clicked, and back to "password" on second click', async () => {
    const user = userEvent.setup()
    render(<PasswordInput id="test-password" name="password" data-testid="pass-input" />)

    const input = screen.getByTestId('pass-input') as HTMLInputElement
    const button = screen.getByRole('button', { name: 'Tampilkan kata sandi' })

    // Default hidden
    expect(input.type).toBe('password')

    // First click -> show password
    await user.click(button)
    expect(input.type).toBe('text')
    expect(screen.getByRole('button', { name: 'Sembunyikan kata sandi' })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'true')

    // Second click -> hide password
    await user.click(button)
    expect(input.type).toBe('password')
    expect(screen.getByRole('button', { name: 'Tampilkan kata sandi' })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('does NOT submit containing form when eye button is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((e) => e.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <PasswordInput id="test-pass" name="password" data-testid="pass-input" />
        <button type="submit">Submit Form</button>
      </form>
    )

    const toggleButton = screen.getByRole('button', { name: 'Tampilkan kata sandi' })
    await user.click(toggleButton)

    // Form onSubmit must NOT be called
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('supports keyboard navigation and focus', async () => {
    const user = userEvent.setup()
    render(<PasswordInput id="test-password" name="password" data-testid="pass-input" />)

    const input = screen.getByTestId('pass-input')
    const button = screen.getByRole('button', { name: 'Tampilkan kata sandi' })

    // Tab to input, then tab to button
    await user.tab()
    expect(input).toHaveFocus()

    await user.tab()
    expect(button).toHaveFocus()

    // Press Space or Enter on button
    await user.keyboard(' ')
    expect(screen.getByTestId('pass-input')).toHaveAttribute('type', 'text')
  })

  it('disables input and toggle button when disabled prop is true', () => {
    render(<PasswordInput id="test-password" disabled data-testid="pass-input" />)

    const input = screen.getByTestId('pass-input')
    const button = screen.getByRole('button', { name: 'Tampilkan kata sandi' })

    expect(input).toBeDisabled()
    expect(button).toBeDisabled()
  })
})
