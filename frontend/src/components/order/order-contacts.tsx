import { toast } from 'react-toastify'
import InputMask from '@mona-health/react-input-mask'
import { SyntheticEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AppRoute } from '../../utils/constants'
import Button from '../button/button'
import { Input } from '../form'
import Form from '../form/form'
import useFormWithValidation from '../form/hooks/useFormWithValidation'
import { ContactsFormValues } from './helpers/types'

import { useActionCreators, useSelector } from '../../services/hooks'
import { basketActions } from '../../services/slice/basket'
import {
    orderFormActions,
    orderFormSelector,
} from '../../services/slice/orderForm'
import EditorInput from '../editor-text/editor-input'
import styles from './order.module.scss'

export function OrderContacts() {
    const [submitting, setSubmitting] = useState(false)
    const location = useLocation()
    const navigate = useNavigate()
    const { selectOrderInfo } = orderFormSelector
    const orderPersistData = useSelector(selectOrderInfo)
    const formRef = useRef<HTMLFormElement | null>(null)
    const { setInfo, createOrder } = useActionCreators(orderFormActions)
    const { resetBasket } = useActionCreators(basketActions)

    const { values, handleChange, errors, isValid, setValuesForm } =
        useFormWithValidation<ContactsFormValues>(
            { email: '', phone: '', comment: '' },
            formRef.current
        )

    useEffect(() => {
        // восстанавливаем значение формы из стора
        setValuesForm({
            email: orderPersistData.email,
            phone: orderPersistData.phone,
        })
    }, [orderPersistData, setValuesForm])

    const handleEditInputChange = (value: string) => {
        setValuesForm({ ...values, comment: value })
    }

    const handleFormSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!isValid || submitting) return
        setSubmitting(true)
        setInfo(values)
        // т.к. на момент отправки запроса данные введенные в поля еще не записаны в store, добавляем в запрос их вручную
        createOrder({ ...orderPersistData, ...values })
            .unwrap()
            .then((dataResponse) => {
                resetBasket()
                navigate(
                    { pathname: AppRoute.OrderSuccess },
                    {
                        state: {
                            orderResponse: dataResponse,
                            background: {
                                ...location,
                                pathname: '/',
                                state: null,
                            },
                        },
                        replace: true,
                    }
                )
            }).catch((error: { message?: string }) => toast.error(error.message || 'Не удалось оформить заказ'))
            .finally(() => setSubmitting(false))
    }

    return (
        <Form handleFormSubmit={handleFormSubmit} formRef={formRef}>
            <Input
                value={values.email || ''}
                onChange={handleChange}
                name='email' maxLength={254}
                type='email'
                placeholder='Введите Email'
                label='Email'
                required
                error={errors.email}
            />
            <Input
                value={values.phone || ''}
                onChange={handleChange}
                name='phone'
                type='tel'
                placeholder='+7 (999) 999-99-99'
                mask='+7 (999) 999 99 99'
                label='Телефон'
                required
                error={errors.phone}
                component={InputMask}
            />

            <EditorInput
                onChange={handleEditInputChange}
                value={values.comment}
            />

            <div className={styles.order__buttons}>
                <Button
                    type='button'
                    extraClass={styles.order__button_secondary}
                    component={Link}
                    to={{ pathname: AppRoute.OrderAddress }}
                    state={{
                        background: { ...location, pathname: '/', state: null },
                    }}
                    replace
                >
                    Назад
                </Button>
                <Button type='submit' disabled={!isValid || submitting}>
                    Оплатить
                </Button>
            </div>
        </Form>
    )
}
