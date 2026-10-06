import { AsyncThunk } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from '@store/hooks'
import { RootState } from '@store/store'
import { WebLarekAPI } from '../../../utils/weblarek-api'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

type ThunkConfig = { extra: WebLarekAPI; state: RootState; dispatch: ReturnType<typeof useDispatch> }
interface PaginationResult<U> {
    data: U[]; totalPages: number; currentPage: number; limit: number
    nextPage: () => void; prevPage: () => void; setPage: (page: number) => void; setLimit: (limit: number) => void
}
const usePagination = <T extends { pagination: { totalPages: number } }, U>(
    asyncAction: AsyncThunk<T, Record<string, unknown>, ThunkConfig>,
    selector: (state: RootState) => U[], defaultLimit: number
): PaginationResult<U> => {
    const dispatch = useDispatch()
    const data = useSelector(selector)
    const [searchParams, setSearchParams] = useSearchParams()
    const [totalPages, setTotalPages] = useState(1)
    const currentPage = Math.max(1, Math.min(Number(searchParams.get('page')) || 1, Math.max(totalPages, 1)))
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || defaultLimit, 10))
    useEffect(() => {
        let active = true
        dispatch(asyncAction({ ...Object.fromEntries(searchParams.entries()), page: currentPage, limit }))
            .unwrap().then((response) => { if (active) setTotalPages(response.pagination.totalPages) })
            .catch(() => { if (active) setTotalPages(1) })
        return () => { active = false }
    }, [asyncAction, dispatch, searchParams, currentPage, limit])
    const updateURL = (params: Record<string, number>) => {
        const updated = new URLSearchParams(searchParams)
        Object.entries(params).forEach(([key, value]) => updated.set(key, String(value)))
        setSearchParams(updated)
    }
    return {
        data, totalPages, currentPage, limit,
        nextPage: () => { if (currentPage < totalPages) updateURL({ page: currentPage + 1, limit }) },
        prevPage: () => { if (currentPage > 1) updateURL({ page: currentPage - 1, limit }) },
        setPage: (page) => updateURL({ page: Math.max(1, Math.min(page, Math.max(totalPages, 1))), limit }),
        setLimit: (newLimit) => updateURL({ page: 1, limit: Math.max(1, Math.min(newLimit, 10)) }),
    }
}
export default usePagination
