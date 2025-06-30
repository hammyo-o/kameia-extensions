import {
    BadgeColor,
    Chapter,
    ChapterDetails,
    ChapterProviding,
    ContentRating,
    DUISection,
    HomePageSectionsProviding,
    HomeSectionType,
    HomeSection,
    MangaInfo,
    MangaProviding,
    PagedResults,
    Request,
    RequestManager,
    Response,
    SearchRequest,
    SearchResultsProviding,
    SourceInfo,
    SourceManga,
    TagSection,
    SourceIntents
} from '@paperback/types'

import {
    getGalleryData,
    getSearchData,
    isCategoryHidden
} from './eHentaiHelper'

import {
    parseArtist,
    parseHomeSections,
    parseLanguage,
    parsePages,
    parseTags,
    parseTitle
} from './eHentaiParser'

import {
    getDisplayedCategories,
    settings,
    resetSettings
} from './eHentaiSettings'

const PAPERBACK_VERSION = '0.8.0'
export const getExportVersion = (EXTENSION_VERSION: string): string => {
    return PAPERBACK_VERSION.split('.').map((x, index) => Number(x) + Number(EXTENSION_VERSION.split('.')[index])).join('.')
}

export const eHentaiInfo: SourceInfo = {
    version: getExportVersion('0.0.3'),
    name: 'e-hentai',
    icon: 'icon.png',
    author: 'kameia, loik',
    description: 'Extension to grab galleries from E-Hentai',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: 'https://e-hentai.org',
    authorWebsite: 'https://github.com/kameiaa',
    sourceTags: [{
        text: '18+',
        type: BadgeColor.YELLOW
    }],
    intents: SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.MANGA_CHAPTERS | SourceIntents.SETTINGS_UI
}

export class eHentai implements SearchResultsProviding, MangaProviding, ChapterProviding, HomePageSectionsProviding {

    constructor(public cheerio: CheerioAPI) { }

    readonly requestManager: RequestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    ...{
                        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
                        'referer': 'https://e-hentai.org/'
                    }
                }
                request.cookies = [App.createCookie({ name: 'nw', value: '1', domain: 'https://e-hentai.org/' })]
                return request
            },

            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    stateManager = App.createSourceStateManager();

    getMangaShareUrl(mangaId: string): string {
        return `https://e-hentai.org/g/${mangaId}`
    }

    async getSearchTags(): Promise<TagSection[]> {
        const categoriesTagSection: TagSection = App.createTagSection({
            id: 'categories', label: 'Categories', tags: [
                App.createTag({ id: 'category:2', label: 'Doujinshi' }),
                App.createTag({ id: 'category:4', label: 'Manga' }),
                App.createTag({ id: 'category:8', label: 'Artist CG' }),
                App.createTag({ id: 'category:16', label: 'Game CG' }),
                App.createTag({ id: 'category:512', label: 'Western' }),
                App.createTag({ id: 'category:256', label: 'Non-H' }),
                App.createTag({ id: 'category:32', label: 'Image Set' }),
                App.createTag({ id: 'category:64', label: 'Cosplay' }),
                App.createTag({ id: 'category:128', label: 'Asian Porn' }),
                App.createTag({ id: 'category:1', label: 'Misc' })
            ]
        })
        const tagSections: TagSection[] = [categoriesTagSection]
        return tagSections
    }

    async supportsTagExclusion(): Promise<boolean> {
        return true
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const section_popular_recently = App.createHomeSection({ id: 'popular_recently', title: 'Popular Recently', type: HomeSectionType.singleRowNormal, containsMoreItems: false })
        const section_latest_galleries = App.createHomeSection({ id: 'latest_galleries', title: 'Latest Galleries', type: HomeSectionType.singleRowNormal, containsMoreItems: true })
        const sections: HomeSection[] = [section_popular_recently, section_latest_galleries]

        await parseHomeSections(this.cheerio, this.requestManager, sections, sectionCallback, this.stateManager)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 0
        let stopSearch = metadata?.stopSearch ?? false
        if(stopSearch) return App.createPagedResults({
            results: [],
            metadata: {
                stopSearch: true
            }
        })

        let nextPageId = { id: 0 }
        const displayedCategories: number[] = await getDisplayedCategories(this.stateManager)
        const excludedCategories: number = displayedCategories.reduce((prev, cur) => prev - cur, 1023)
        const results = await getSearchData('', page, excludedCategories, this.requestManager, this.cheerio, nextPageId, this.stateManager)
        if (results[results.length - 1]?.mangaId == 'stopSearch') {
            results.pop()
            stopSearch = true
        }

        return App.createPagedResults({
            results: results,
            metadata: {
                page: nextPageId.id ?? 0,
                stopSearch: stopSearch
            }
        })
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {
    // Note: The function now returns a 'Manga' object, not a 'SourceManga'
    
    // Call the updated getGalleryData function. It no longer needs the requestManager.
    const galleryDataArray = await getGalleryData([mangaId]);
    if (!galleryDataArray || galleryDataArray.length === 0) {
        throw new Error(`Failed to get gallery data for mangaId: ${mangaId}`);
    }
    const data = galleryDataArray[0];

    const languageStr = parseLanguage(data.tags);

    // Create the mangaInfo object using the 0.9 structure and property names
    const mangaInfo = {
        thumbnailUrl: data.thumb,
        synopsis: `Pages: ${data.filecount} | Language: ${languageStr} | Rating: ${data.rating} | Uploader: ${data.uploader}`,
        primaryTitle: parseTitle(data.title),
        secondaryTitles: [parseTitle(data.title_jpn)],
        // Map the 'hentai' boolean to the ContentRating enum string
        contentRating: !(data.category == 'Non-H' || data.tags.includes('other:non-nude')) ? 'ADULT' : 'EVERYONE',
        status: 'COMPLETED',
        artist: parseArtist(data.tags),
        author: parseArtist(data.tags), // E-Hentai doesn't distinguish, so we use artist for both
        rating: parseFloat(data.rating),
        // The 'tags' property is now 'tagGroups'
        tagGroups: parseTags([data.category, ...data.tags]),
        shareUrl: `https://e-hentai.org/g/${mangaId}`
    };

    // Return the final object in the new 0.9 format
    return {
        mangaId: mangaId,
        mangaInfo: mangaInfo
    };
}

    async getChapters(mangaId: string): Promise<Chapter[]> {
        let data = (await getGalleryData([mangaId], this.requestManager))[0]
        const chapters: Chapter[] = []
        const chaptersLoopNum: number = Math.ceil(data.filecount / 40)

        // Push entire gallery first, then split gallery
        chapters.push(App.createChapter({
            id: 'Full-' + data.filecount,
            name: 'Gallery (Warning - loading time grows with more pages)',
            chapNum: chaptersLoopNum + 1,
            time: new Date(parseInt(data.posted) * 1000),
            volume: 0,
            sortingIndex: chaptersLoopNum
        }))

        for (let i: number = 0; i < chaptersLoopNum; ++i) {
            let startPage: number = ((i * 40) + 1)
            let endPage: number = (i == chaptersLoopNum - 1 ? parseInt(data.filecount) : (i + 1) * 40)
            const websitePageNum: number = i
            chapters.push(App.createChapter({
                id: 'Pages-' + websitePageNum,
                name: 'Page ' + startPage + ' - ' + endPage,
                chapNum: i + 1,
                time: new Date(parseInt(data.posted) * 1000),
                volume: 0,
                sortingIndex: i
            }))
        }

        return chapters
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        return App.createChapterDetails({
            mangaId: mangaId,
            id: chapterId,
            pages: await parsePages(mangaId, chapterId, this.requestManager, this.cheerio)
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 0
        let stopSearch = metadata?.stopSearch ?? false
        if (stopSearch) {
            return App.createPagedResults({
                results: undefined,
                metadata: {
                    stopSearch: true
                }
            })
        }

        const includedCategories = query.includedTags?.filter(tag => tag.id.startsWith('category:'))
        const excludedCategories = query.excludedTags?.filter(tag => tag.id.startsWith('category:'))
        let categories = 0
        if (includedCategories != undefined && includedCategories.length != 0) {
            let includedCategoriesNum = includedCategories.map(tag => parseInt(tag.id.substring(9)))
            for (let includedCategoryNum of includedCategoriesNum) {
                if (await isCategoryHidden(includedCategoryNum, this.stateManager)) {
                    includedCategoriesNum.splice(includedCategoriesNum.indexOf(includedCategoryNum), 1)
                }
            }
            categories = includedCategoriesNum.reduce((prev, cur) => prev - cur, 1023)
            if (categories == 1023) {
                categories = (await getDisplayedCategories(this.stateManager)).reduce((prev, cur) => prev - cur, 1023)
            }
        }
        else if (excludedCategories != undefined && excludedCategories.length != 0) {
            let excludedCategoriesNum = excludedCategories.map(tag => parseInt(tag.id.substring(9)))
            for (let i: number = excludedCategoriesNum.length - 1; i >= 0; --i) {
                let excludedCategoryNum: number = excludedCategoriesNum[i] ?? -1
                if (excludedCategoryNum == -1) {
                    continue
                }
                if (await isCategoryHidden(excludedCategoryNum, this.stateManager)) {
                    excludedCategoriesNum.splice(excludedCategoriesNum.indexOf(excludedCategoryNum), 1)
                }
            }

            let stateManagerHiddenCategories: number[] = await getDisplayedCategories(this.stateManager)
            excludedCategoriesNum.push(stateManagerHiddenCategories.reduce((prev, cur) => prev - cur, 1023))
            categories = excludedCategoriesNum.reduce((prev, cur) => prev + cur, 0)
        }
        else {
            categories = (await getDisplayedCategories(this.stateManager)).reduce((prev, cur) => prev - cur, 1023)
        }

        if (Number.isNaN(categories) || categories == 1023) {
            categories = 0
        }

        let nextPageId = { id: 0 }
        const results = await getSearchData(query.title, page, categories, this.requestManager, this.cheerio, nextPageId, this.stateManager)
        if (results[results.length - 1]?.mangaId == 'stopSearch') {
            results.pop()
            stopSearch = true
        }

        return App.createPagedResults({
            results: results,
            metadata: {
                page: nextPageId.id ?? 0,
                stopSearch: stopSearch
            }
        })
    }

    async getSourceMenu(): Promise<DUISection> {
        return Promise.resolve(App.createDUISection({
            id: 'main',
            header: 'Source Settings',
            rows: () => Promise.resolve([
                settings(this.stateManager),
                resetSettings(this.stateManager)
            ]),
            isHidden: false
        }))
    }
}
