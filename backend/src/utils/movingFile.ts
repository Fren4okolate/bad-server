import { rename , access } from 'fs/promises'
import { basename, join } from 'path'

async function movingFile(imagePath: string, from: string, to: string): Promise<void> {
    const fileName = basename(imagePath)
    const imagePathTemp = join(from, fileName)
    const imagePathPermanent = join(to, fileName)
    
    try {
        await access(imagePathTemp)
        
        await rename(imagePathTemp, imagePathPermanent)
    } catch (error) {
        throw new Error('Ошибка при сохранении файла')
    }
}

export default movingFile