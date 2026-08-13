import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ItemsClient from '@/app/admin/items/items-client'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  deactivateItem: vi.fn(),
  activateItem: vi.fn(),
  searchParams: new URLSearchParams('search=kertas&active=true&page=1'),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => '/admin/items',
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('@/app/admin/items/actions', () => ({
  deactivateItem: mocks.deactivateItem,
  activateItem: mocks.activateItem,
}))

const item = {
  id: '20000000-0000-4000-8000-000000000001',
  sku: 'ATK-0001',
  barcode: 'IB-000001',
  name: 'Kertas HVS',
  current_stock: 20,
  minimum_stock: 5,
  is_active: true,
  categories: { id: '30000000-0000-4000-8000-000000000001', name: 'Kertas' },
  base_unit: { id: '40000000-0000-4000-8000-000000000001', name: 'Rim', symbol: 'rim' },
}

describe('ItemsClient pagination', () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.refresh.mockReset()
    mocks.searchParams = new URLSearchParams('search=kertas&active=true&page=1')
  })

  it('keeps active filters while navigating to the next page', async () => {
    const user = userEvent.setup()
    render(
      <ItemsClient
        initialItems={[item]}
        totalCount={50}
        page={1}
        pageSize={25}
        categories={[item.categories]}
        search="kertas"
        categoryFilter=""
        activeFilter="true"
        isAdmin
      />,
    )

    await user.click(screen.getByRole('button', { name: /Berikutnya/i }))

    expect(mocks.push).toHaveBeenCalledWith('/admin/items?search=kertas&active=true&page=2')
  })
})
