import {
    PartialSourceManga,
    RequestManager,
    SourceStateManager
} from '@paperback/types'

import {
    parseMenuListPage,
    parseUrlParams,
    UrlInfo
} from './eHentaiParser'

import {
    getExtraArgs, getDisplayedCategories
} from './eHentaiSettings'

export async function getGalleryData(ids: string[]): Promise<any> {
    const request = {
        url: 'https://api.e-hentai.org/api.php',
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        // POST data must be stringified in Paperback 0.9
        data: JSON.stringify({
            'method': 'gdata',
            'gidlist': ids.map(id => id.split('/')),
            'namespace': 1
        })
    };

    // Use the new 0.9 request method which returns [response, responseBody]
    const [response, responseBody] = await Application.scheduleRequest(request);
    if (response.status !== 200) {
        throw new Error(`API request failed for getGalleryData with status ${response.status}`);
    }

    // The response body is an ArrayBuffer and needs to be converted to a string
    const responseString = Application.arrayBufferToUTF8String(responseBody);
    const json = JSON.parse(responseString.replaceAll(/[\r\n]+/g, ' '));
    return json.gmetadata;
}

export async function getSearchData(query: string | undefined, page: number, categories: number, requestManager: RequestManager, cheerio: CheerioAPI, nextPageId: { id: number }, sourceStateManager: SourceStateManager): Promise<PartialSourceManga[]> {
    let finalQuery = (query ?? '') + ' ' + await getExtraArgs(sourceStateManager)

    const request = App.createRequest({
        url: `https://e-hentai.org/?next=${page}&f_cats=${categories}&f_search=${encodeURIComponent(finalQuery)}`,
        method: 'GET'
    })
    const result = await requestManager.schedule(request, 1)
    const $ = cheerio.load(result.data as string)

    let urlInfo: UrlInfo = parseUrlParams($('#unext').attr('href') ?? '')
    nextPageId.id = urlInfo.id

    return parseMenuListPage($)
}

export function getRowDetails($: CheerioStatic, manga: CheerioElement, info: { id: string, title: string, image: string, subtitle: string }) {
    info.id = idCleaner($('td.gl3c.glname', manga).contents().attr('href') ?? '/////')
    info.title = $('.glink', manga).text().trim()
    let imageObj: Cheerio | undefined = $(['div#it', info.id.split('/')[0],' div img'].join(''))
    const dataSrc = imageObj.attr('data-src')
    if ((typeof dataSrc != 'undefined')) {
        info.image = dataSrc
    } else {
        info.image = imageObj.attr('src') as string
    }
    info.subtitle = $('td.gl1c.glcat', manga).text().trim()
    return info
}

export function idCleaner(str: string | null): string {
    const splitUrlContents = str?.split('/')
    if (splitUrlContents == null) {
        return `1`
    }
    
    return `${splitUrlContents[4]}/${splitUrlContents[5]}`
}

export async function isCategoryHidden(category: number, sourceStateManager: SourceStateManager): Promise<boolean> {
    const displayedCategories: number[] = await getDisplayedCategories(sourceStateManager)
    return displayedCategories.filter((displayedCategory) => displayedCategory == category).length == 0
}

interface Category {
    name: string;
    value: string;
}

class eHentaiCategories {
    Categories: Category[] = [
        {
            name: "Doujinshi",
            value: '2'
        },
        {
            name: "Manga",
            value: '4'
        },
        {
            name: "Artist CG",
            value: '8'
        },
        {
            name: "Game CG",
            value: '16'
        },
        {
            name: "Western",
            value: '512'
        },
        {
            name: "Non-H",
            value: '256'
        },
        {
            name: "Image Set",
            value: '32'
        },
        {
            name: "Cosplay",
            value: '64'
        },
        {
            name: "Asian Porn",
            value: '128'
        },
        {
            name: "Misc",
            value: '1'
        }
    ]

    getName(categoryValue: string): string {
        return (
            this.Categories.filter((category) => category.value == categoryValue)[0]?.name ?? ''
        )
    }

    getValueList(): string[] {
        return this.Categories.map((category) => category.value)
    }
}

export const eHentaiCategoriesList = new eHentaiCategories()
