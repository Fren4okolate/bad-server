import { safeComment } from '../../utils/sanitize-html'
import {
    ContentEditableEvent,
    createButton,
    Editor,
    EditorProvider,
    Toolbar,
} from 'react-simple-wysiwyg'
import './editor-input.scss'

type EditorInputProps = {
    value: string
    onChange: (value: string) => void
}

export default function EditorInput({ onChange, value }: EditorInputProps) {
    function handleChangeElement(e: ContentEditableEvent) {
        onChange(safeComment(e.target.value).slice(0, 2000))
    }

    const BtnLinkCustom = createButton(
        'Вставить ссылку',
        '🔗',
        ({ $selection }) => {
            if ($selection?.nodeName === 'A') {
                document.execCommand('unlink')
            } else {

                const url = prompt('URL', '')
                if (url && /^https?:\/\//i.test(url)) document.execCommand('createLink', false, url)
            }
        }
    )

    return (
        <div className='customEditor'>
            <EditorProvider>
                <Editor value={safeComment(value)} onChange={handleChangeElement} onPaste={(event) => {
                    event.preventDefault()
                    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
                }}>
                    <Toolbar>
                        <span className='rsw-link-title'>
                            Вставить ссылку <BtnLinkCustom />
                        </span>
                    </Toolbar>
                </Editor>
            </EditorProvider>
        </div>
    )
}
