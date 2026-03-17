import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { KeywordSearchService } from './services/keyword-search.service';
import { ConfigService } from '@nestjs/config';
import { SearchQuery } from './dto/search-query.dto';

describe('SearchService', () => {
  let service: SearchService;
  let keywordSearch: jest.Mocked<KeywordSearchService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: KeywordSearchService,
          useValue: { search: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock') },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    keywordSearch = module.get(KeywordSearchService);
  });

  it('should return empty results for no matches', async () => {
    const query: SearchQuery = { q: 'test', limit: 20, offset: 0, mode: 'keyword' };
    const result = await service.search(query);
    expect(result.results).toHaveLength(0);
    expect(result.query).toBe('test');
    expect(result.mode).toBe('keyword');
  });

  it('should call keywordSearch for keyword mode', async () => {
    const query: SearchQuery = { q: 'hello', limit: 10, offset: 0, mode: 'keyword' };
    await service.search(query);
    expect(keywordSearch.search).toHaveBeenCalledWith(query);
  });
});
