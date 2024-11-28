const moment = require('moment');
const _ = require('lodash');

/* eslint-disable global-require */
describe('place-buy-order.js', () => {
  let result;
  let orgRawData;
  let rawData;

  let binanceMock;
  let slackMock;
  let loggerMock;

  let mockIsExceedAPILimit;
  let mockGetAPILimit;
  let mockSaveOrderStats;
  let mockSaveOverrideAction;

  let mockRefreshOpenOrdersAndAccountInfo;

  let mockSaveGridTradeOrder;

  let mockIsBuyAllowedByTradingView;

  const tradingViewValidTime = moment()
    .utc()
    .subtract('1', 'minute')
    .format('YYYY-MM-DDTHH:mm:ss.SSSSSS');

  describe('execute', () => {
    beforeEach(() => {
      jest.clearAllMocks().resetModules();
    });

    beforeEach(async () => {
      const { binance, slack, logger } = require('../../../../helpers');

      binanceMock = binance;
      slackMock = slack;
      loggerMock = logger;

      slackMock.sendMessage = jest.fn().mockResolvedValue(true);
      binanceMock.client.order = jest.fn().mockResolvedValue(true);

      mockIsExceedAPILimit = jest.fn().mockReturnValue(false);
      mockGetAPILimit = jest.fn().mockResolvedValue(10);

      mockSaveGridTradeOrder = jest.fn().mockResolvedValue(true);
      mockSaveOrderStats = jest.fn().mockResolvedValue(true);
      mockSaveOverrideAction = jest.fn().mockResolvedValue(true);
      mockRefreshOpenOrdersAndAccountInfo = jest.fn().mockResolvedValue({
        accountInfo: {
          accountInfo: 'updated'
        },
        openOrders: [{ openOrders: 'retrieved' }],
        buyOpenOrders: [{ buyOpenOrders: 'retrived' }],
        sellOpenOrders: [{ sellOpenOrders: 'retrived' }]
      });

      mockIsBuyAllowedByTradingView = jest.fn().mockReturnValue({
        isTradingViewAllowed: true,
        tradingViewRejectedReason: ''
      });

      jest.mock('../../../trailingTradeHelper/common', () => ({
        isExceedAPILimit: mockIsExceedAPILimit,
        getAPILimit: mockGetAPILimit,
        saveOrderStats: mockSaveOrderStats,
        saveOverrideAction: mockSaveOverrideAction,
        refreshOpenOrdersAndAccountInfo: mockRefreshOpenOrdersAndAccountInfo
      }));

      jest.mock('../../../trailingTradeHelper/order', () => ({
        saveGridTradeOrder: mockSaveGridTradeOrder
      }));

      jest.mock('../../../trailingTradeHelper/tradingview', () => ({
        isBuyAllowedByTradingView: mockIsBuyAllowedByTradingView
      }));

      orgRawData = {
        symbol: 'BTCUPUSDT',
        featureToggle: {
          notifyDebug: true
        },
        symbolInfo: {
          baseAsset: 'BTCUP',
          quoteAsset: 'USDT',
          filterLotSize: { stepSize: '0.01000000' },
          filterPrice: { tickSize: '0.00100000' },
          filterMinNotional: { minNotional: '10.00000000' }
        },
        symbolConfiguration: {
          symbols: ['BTCUPUSDT', 'ETHBTC', 'ALPHABTC', 'BTCBRL', 'BNBUSDT'],
          buy: {
            enabled: true,
            currentGridTradeIndex: 0,
            currentGridTrade: {
              triggerPercentage: 1,
              minPurchaseAmount: 10,
              maxPurchaseAmount: 50,
              stopPercentage: 1.01,
              limitPercentage: 1.011,
              executed: false,
              executedOrder: null
            },
            tradingView: {
              whenStrongBuy: false,
              whenBuy: false
            }
          },
          botOptions: {
            tradingViews: [
              {
                interval: '5m',
                buy: {
                  whenStrongBuy: false,
                  whenBuy: false
                }
              },
              {
                interval: '15m',
                buy: {
                  whenStrongBuy: false,
                  whenBuy: false
                }
              }
            ],
            tradingViewOptions: {
              useOnlyWithin: 5,
              ifExpires: 'ignore'
            }
          },
          system: {
            checkOrderExecutePeriod: 10
          }
        },
        action: 'buy',
        quoteAssetBalance: { free: 0, locked: 0 },
        buy: { currentPrice: 200, openOrders: [] },
        tradingViews: [
          {
            request: {
              interval: '15m'
            },
            result: {
              summary: { RECOMMENDATION: 'SELL' },
              time: tradingViewValidTime
            }
          },
          {
            request: {
              interval: '5m'
            },
            result: {
              summary: { RECOMMENDATION: 'BUY' },
              time: tradingViewValidTime
            }
          }
        ],
        overrideData: {}
      };
    });

    const doNotProcessTests = () => {
      it('does not trigger binance.client.order', () => {
        expect(binanceMock.client.order).not.toHaveBeenCalled();
      });

      it('does not trigger refreshOpenOrdersAndAccountInfo', () => {
        expect(mockRefreshOpenOrdersAndAccountInfo).not.toHaveBeenCalled();
      });

      it('does not trigger saveGridTradeOrder', () => {
        expect(mockSaveGridTradeOrder).not.toHaveBeenCalled();
      });

      it('does not trigger saveOrderStats', () => {
        expect(mockSaveOrderStats).not.toHaveBeenCalled();
      });
    };

    describe('when action is not buy', () => {
      beforeEach(async () => {
        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);
        rawData.action = 'not-determined';

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('retruns expected value', () => {
        expect(result).toStrictEqual(rawData);
      });
    });

    describe('when open orders exist', () => {
      beforeEach(async () => {
        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);
        rawData.buy.openOrders = [
          {
            orderId: 46838,
            type: 'STOP_LOSS_LIMIT',
            side: 'BUY',
            price: '201.000000',
            origQty: '0.5',
            stopPrice: '200.000000'
          }
        ];

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('retruns expected value', () => {
        expect(result).toMatchObject({
          buy: {
            currentPrice: 200,
            openOrders: [
              {
                orderId: 46838,
                type: 'STOP_LOSS_LIMIT',
                side: 'BUY',
                price: '201.000000',
                origQty: '0.5',
                stopPrice: '200.000000'
              }
            ],
            processMessage:
              'There are open orders for BTCUPUSDT. Do not place an order for the grid trade #1.',
            updatedAt: expect.any(Object)
          }
        });
      });
    });

    describe('when current grid trade is not defined', () => {
      beforeEach(async () => {
        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);
        rawData.symbolConfiguration.buy = {
          enabled: true,
          currentGridTradeIndex: -1,
          currentGridTrade: null
        };

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('retruns expected value', () => {
        expect(result).toMatchObject({
          buy: {
            currentPrice: 200,
            openOrders: [],
            processMessage:
              'Current grid trade is not defined. Cannot place an order.',
            updatedAt: expect.any(Object)
          }
        });
      });
    });

    describe('when tradingView recommendation is not allowed', () => {
      beforeEach(async () => {
        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);
        rawData.symbolConfiguration.buy = {
          enabled: true,
          currentGridTradeIndex: 0,
          currentGridTrade: {
            triggerPercentage: 1,
            minPurchaseAmount: -1,
            maxPurchaseAmount: -1,
            stopPercentage: 1.01,
            limitPercentage: 1.011,
            executed: false,
            executedOrder: null
          }
        };

        mockIsBuyAllowedByTradingView = jest.fn().mockReturnValue({
          isTradingViewAllowed: false,
          tradingViewRejectedReason: ''
        });

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('retruns expected value', () => {
        expect(result).toMatchObject({
          buy: {
            currentPrice: 200,
            openOrders: [],
            processMessage:
              'Min purchase amount must be configured. Please configure symbol settings.',
            updatedAt: expect.any(Object)
          }
        });
      });
    });

    describe('when min purchase amount is not configured for some reason', () => {
      beforeEach(async () => {
        mockIsBuyAllowedByTradingView = jest.fn().mockReturnValue({
          isTradingViewAllowed: false,
          tradingViewRejectedReason: 'rejected reason'
        });
        jest.mock('../../../trailingTradeHelper/tradingview', () => ({
          isBuyAllowedByTradingView: mockIsBuyAllowedByTradingView
        }));

        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);
        rawData.symbolConfiguration.buy = {
          enabled: true,
          currentGridTradeIndex: 0,
          currentGridTrade: {
            triggerPercentage: 1,
            minPurchaseAmount: -1,
            maxPurchaseAmount: -1,
            stopPercentage: 1.01,
            limitPercentage: 1.011,
            executed: false,
            executedOrder: null
          }
        };
        rawData.symbolConfiguration.botOptions.tradingViews = [
          {
            interval: '5m',
            buy: {
              whenStrongBuy: false,
              whenBuy: false
            }
          }
        ];

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('saves override action', () => {
        expect(mockSaveOverrideAction).toHaveBeenCalledWith(
          loggerMock,
          'BTCUPUSDT',
          {
            action: 'buy',
            actionAt: expect.any(String),
            checkTradingView: true,
            notify: false,
            triggeredBy: 'buy-order-trading-view'
          },
          'The bot queued the action to trigger the grid trade #1 for buying. rejected reason'
        );
      });
      it('retruns expected value', () => {
        expect(result).toMatchObject({
          buy: {
            currentPrice: 200,
            openOrders: [],
            processMessage: 'rejected reason',
            updatedAt: expect.any(Object)
          }
        });
      });
    });

    describe('when max purchase amount is not configured for some reason', () => {
      beforeEach(async () => {
        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);
        rawData.symbolConfiguration.buy = {
          enabled: true,
          currentGridTradeIndex: 0,
          currentGridTrade: {
            triggerPercentage: 1,
            minPurchaseAmount: 10,
            maxPurchaseAmount: -1,
            stopPercentage: 1.01,
            limitPercentage: 1.011,
            executed: false,
            executedOrder: null
          }
        };

        rawData.symbolConfiguration.botOptions.tradingViews = [
          {
            interval: '5m',
            buy: {
              whenStrongBuy: false,
              whenBuy: false
            }
          }
        ];

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('retruns expected value', () => {
        expect(result).toMatchObject({
          buy: {
            currentPrice: 200,
            openOrders: [],
            processMessage:
              'Max purchase amount must be configured. Please configure symbol settings.',
            updatedAt: expect.any(Object)
          }
        });
      });
    });

    describe('when balance is less than minimum notional value', () => {
      [
        {
          symbol: 'BTCUPUSDT',
          rawData: {
            symbol: 'BTCUPUSDT',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'BTCUP',
              quoteAsset: 'USDT',
              filterLotSize: { stepSize: '0.01000000', minQty: '0.01000000' },
              filterPrice: { tickSize: '0.00100000' },
              filterMinNotional: { minNotional: '10.00000000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 10,
                  maxPurchaseAmount: 50,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 9, locked: 0 },
            buy: {
              currentPrice: 200,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 200,
              openOrders: [],
              processMessage:
                'Do not place a buy order for the grid trade #1 as not enough USDT to buy BTCUP.',
              updatedAt: expect.any(Object)
            }
          }
        },
        {
          symbol: 'ETHBTC',
          rawData: {
            symbol: 'ETHBTC',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'ETH',
              quoteAsset: 'BTC',
              filterLotSize: { stepSize: '0.00100000', minQty: '0.00100000' },
              filterPrice: { tickSize: '0.00000100' },
              filterMinNotional: { minNotional: '0.00010000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 10,
                  maxPurchaseAmount: 0.001,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 0.00009, locked: 0 },
            buy: {
              currentPrice: 0.044866,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 0.044866,
              openOrders: [],
              processMessage:
                'Do not place a buy order for the grid trade #1 as not enough BTC to buy ETH.',
              updatedAt: expect.any(Object)
            }
          }
        },
        {
          symbol: 'ALPHABTC',
          rawData: {
            symbol: 'ALPHABTC',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'ALPHA',
              quoteAsset: 'BTC',
              filterLotSize: { stepSize: '1.00000000', minQty: '1.00000000' },
              filterPrice: { tickSize: '0.00000001' },
              filterMinNotional: { minNotional: '0.00010000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 10,
                  maxPurchaseAmount: 0.001,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 0.00009, locked: 0 },
            buy: {
              currentPrice: 0.00003771,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 0.00003771,
              openOrders: [],
              processMessage:
                'Do not place a buy order for the grid trade #1 as not enough BTC to buy ALPHA.',
              updatedAt: expect.any(Object)
            }
          }
        },
        {
          symbol: 'BTCBRL',
          rawData: {
            symbol: 'BTCBRL',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'BTC',
              quoteAsset: 'BRL',
              filterLotSize: { stepSize: '0.00000100', minQty: '0.00000100' },
              filterPrice: { tickSize: '1.00000000' },
              filterMinNotional: { minNotional: '10.00000000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 10,
                  maxPurchaseAmount: 50,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 9, locked: 0 },
            buy: {
              currentPrice: 268748,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 268748,
              openOrders: [],
              processMessage:
                'Do not place a buy order for the grid trade #1 as not enough BRL to buy BTC.',
              updatedAt: expect.any(Object)
            }
          }
        }
      ].forEach(t => {
        describe(`${t.symbol}`, () => {
          beforeEach(async () => {
            const step = require('../place-buy-order');

            rawData = _.cloneDeep(t.rawData);

            result = await step.execute(loggerMock, rawData);
          });

          doNotProcessTests();

          it('retruns expected value', () => {
            expect(result).toMatchObject(t.expected);
          });
        });
      });
    });

    describe('when balance is not enough after calculation', () => {
      [
        {
          symbol: '',
          rawData: {
            symbol: 'BTCUPUSDT',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'BTCUP',
              quoteAsset: 'USDT',
              filterLotSize: { stepSize: '0.01000000', minQty: '0.01000000' },
              filterPrice: { tickSize: '0.00100000' },
              filterMinNotional: { minNotional: '10.00000000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 10,
                  maxPurchaseAmount: 50,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                },
                tradingView: {
                  whenStrongBuy: false,
                  whenBuy: false
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 10.01, locked: 0 },
            buy: {
              currentPrice: 200,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 200,
              openOrders: [],
              processMessage:
                `Do not place a buy order for the grid trade #1 as not enough ` +
                `USDT to buy BTCUP after calculating commission - ` +
                `Order amount: 8.088 USDT, Minimum notional: 10.00000000.`,
              updatedAt: expect.any(Object)
            }
          }
        },
        {
          symbol: 'ETHBTC',
          rawData: {
            symbol: 'ETHBTC',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'ETH',
              quoteAsset: 'BTC',
              filterLotSize: { stepSize: '0.00100000', minQty: '0.00100000' },
              filterPrice: { tickSize: '0.00000100' },
              filterMinNotional: { minNotional: '0.00010000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 0.0001,
                  maxPurchaseAmount: 0.001,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 0.0001, locked: 0 },
            buy: {
              currentPrice: 0.044866,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 0.044866,
              openOrders: [],
              processMessage:
                `Do not place a buy order for the grid trade #1 ` +
                `as not enough BTC to buy ETH after calculating commission - ` +
                `Order amount: 0.00009 BTC, Minimum notional: 0.00010000.`,
              updatedAt: expect.any(Object)
            }
          }
        },
        {
          symbol: 'ALPHABTC',
          rawData: {
            symbol: 'ALPHABTC',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'ALPHA',
              quoteAsset: 'BTC',
              filterLotSize: { stepSize: '1.00000000', minQty: '1.00000000' },
              filterPrice: { tickSize: '0.00000001' },
              filterMinNotional: { minNotional: '0.00010000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 0.0001,
                  maxPurchaseAmount: 0.001,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 0.0001, locked: 0 },
            buy: {
              currentPrice: 0.00003771,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 0.00003771,
              openOrders: [],
              processMessage:
                `Do not place a buy order for the grid trade #1 ` +
                `as not enough BTC to buy ALPHA after calculating commission - ` +
                `Order amount: 0.00007624 BTC, Minimum notional: 0.00010000.`,
              updatedAt: expect.any(Object)
            }
          }
        },
        {
          symbol: 'BTCBRL',
          rawData: {
            symbol: 'BTCBRL',
            featureToggle: {
              notifyDebug: true
            },
            symbolInfo: {
              baseAsset: 'BTC',
              quoteAsset: 'BRL',
              filterLotSize: { stepSize: '0.00000100', minQty: '0.00000100' },
              filterPrice: { tickSize: '1.00000000' },
              filterMinNotional: { minNotional: '10.00000000' }
            },
            symbolConfiguration: {
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 10,
                  maxPurchaseAmount: 50,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 10.01, locked: 0 },
            buy: {
              currentPrice: 268748,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'NEUTRAL' },
                  time: tradingViewValidTime
                }
              }
            ]
          },
          expected: {
            buy: {
              currentPrice: 268748,
              openOrders: [],
              processMessage:
                `Do not place a buy order for the grid trade #1 as not enough ` +
                `BRL to buy BTC after calculating commission - Order amount: ` +
                `9 BRL, Minimum notional: 10.00000000.`,
              updatedAt: expect.any(Object)
            }
          }
        }
      ].forEach(t => {
        describe(`${t.symbol}`, () => {
          beforeEach(async () => {
            const step = require('../place-buy-order');

            rawData = _.cloneDeep(t.rawData);

            result = await step.execute(loggerMock, rawData);
          });

          doNotProcessTests();

          it('retruns expected value', () => {
            expect(result).toMatchObject(t.expected);
          });
        });
      });
    });

    describe('when trading is disabled', () => {
      beforeEach(async () => {
        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);

        rawData.quoteAssetBalance = { free: 15 };

        rawData.symbolConfiguration.buy = {
          enabled: false,
          currentGridTradeIndex: 0,
          currentGridTrade: {
            triggerPercentage: 1,
            minPurchaseAmount: 10,
            maxPurchaseAmount: 50,
            stopPercentage: 1.01,
            limitPercentage: 1.011,
            executed: false,
            executedOrder: null
          }
        };

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('retruns expected value', () => {
        expect(result).toMatchObject({
          buy: {
            currentPrice: 200,
            openOrders: [],
            processMessage:
              'Trading for BTCUPUSDT is disabled. Do not place an order for the grid trade #1.',
            updatedAt: expect.any(Object)
          }
        });
      });
    });

    describe('when API limit is exceeded', () => {
      beforeEach(async () => {
        mockIsExceedAPILimit = jest.fn().mockReturnValue(true);

        jest.mock('../../../trailingTradeHelper/common', () => ({
          isExceedAPILimit: mockIsExceedAPILimit,
          getAPILimit: mockGetAPILimit,
          saveOrderStats: mockSaveOrderStats,
          saveOverrideAction: mockSaveOverrideAction,
          refreshOpenOrdersAndAccountInfo: mockRefreshOpenOrdersAndAccountInfo
        }));

        const step = require('../place-buy-order');

        rawData = _.cloneDeep(orgRawData);
        rawData.quoteAssetBalance = { free: 101 };

        result = await step.execute(loggerMock, rawData);
      });

      doNotProcessTests();

      it('retruns expected value', () => {
        expect(result).toMatchObject({
          buy: {
            currentPrice: 200,
            openOrders: [],
            processMessage:
              'Binance API limit has been exceeded. Do not place an order.',
            updatedAt: expect.any(Object)
          }
        });
      });
    });

    describe('when has enough balance', () => {
      describe('when free balance is less than minimum purchase amount', () => {
        describe('BTCUPUSDT', () => {
          beforeEach(async () => {
            binanceMock.client.order = jest.fn().mockResolvedValue({
              symbol: 'BTCUPUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            });

            jest.mock('../../../trailingTradeHelper/common', () => ({
              isExceedAPILimit: mockIsExceedAPILimit,
              getAPILimit: mockGetAPILimit,
              saveOrderStats: mockSaveOrderStats,
              saveOverrideAction: mockSaveOverrideAction,
              refreshOpenOrdersAndAccountInfo:
                mockRefreshOpenOrdersAndAccountInfo
            }));

            const step = require('../place-buy-order');

            rawData = {
              symbol: 'BTCUPUSDT',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'BTCUP',
                quoteAsset: 'USDT',
                filterLotSize: { stepSize: '0.01000000', minQty: '0.01000000' },
                filterPrice: { tickSize: '0.00100000' },
                filterMinNotional: { minNotional: '10.00000000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 15,
                    maxPurchaseAmount: 20,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 12, locked: 0 },
              buy: {
                currentPrice: 200,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            };

            result = await step.execute(loggerMock, rawData);
          });

          doNotProcessTests();

          it('retruns expected value', () => {
            expect(result).toMatchObject({
              buy: {
                currentPrice: 200,
                openOrders: [],
                processMessage:
                  `Do not place a buy order for the grid trade #1 because ` +
                  `free balance is less than minimum purchase amount.`,
                updatedAt: expect.any(Object)
              }
            });
          });
        });
      });

      describe('when max purchase amount is exactly same as minimum notional value', () => {
        [
          {
            symbol: 'BTCUPUSDT',
            binanceMockClientOrderResult: {
              symbol: 'BTCUPUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'BTCUPUSDT',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'BTCUP',
                quoteAsset: 'USDT',
                filterLotSize: { stepSize: '0.01000000', minQty: '0.01000000' },
                filterPrice: { tickSize: '0.00100000' },
                filterMinNotional: { minNotional: '10.00000000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 10,
                    maxPurchaseAmount: 10,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 50, locked: 10 },
              buy: {
                currentPrice: 200,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 202.2,
              quantity: 0.05,
              side: 'buy',
              stopPrice: 202,
              symbol: 'BTCUPUSDT',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'BTCUPUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [{ asset: 'USDT', free: 39.89, locked: 20.11 }],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 200,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          },
          {
            symbol: 'ETHBTC',
            binanceMockClientOrderResult: {
              symbol: 'ETHBTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'ETHBTC',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'ETH',
                quoteAsset: 'BTC',
                filterLotSize: { stepSize: '0.00100000', minQty: '0.00100000' },
                filterPrice: { tickSize: '0.00000100' },
                filterMinNotional: { minNotional: '0.00010000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 0.0001,
                    maxPurchaseAmount: 0.0001,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 0.002, locked: 0.001 },
              buy: {
                currentPrice: 0.044866,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 0.045359,
              quantity: 0.003,
              side: 'buy',
              stopPrice: 0.045314,
              symbol: 'ETHBTC',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'ETHBTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [
              { asset: 'BTC', free: 0.001863923, locked: 0.001136077 }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 0.044866,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          },
          {
            symbol: 'ALPHABTC',
            binanceMockClientOrderResult: {
              symbol: 'ALPHABTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'ALPHABTC',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'ALPHA',
                quoteAsset: 'BTC',
                filterLotSize: { stepSize: '1.00000000', minQty: '1.00000000' },
                filterPrice: { tickSize: '0.00000001' },
                filterMinNotional: { minNotional: '0.00010000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 0.0001,
                    maxPurchaseAmount: 0.0001,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 0.002, locked: 0 },
              buy: {
                currentPrice: 0.00003771,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 0.00003812,
              quantity: 3,
              side: 'buy',
              stopPrice: 0.00003808,
              symbol: 'ALPHABTC',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'ALPHABTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [
              { asset: 'BTC', free: 0.00188564, locked: 0.00011436000000000001 }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 0.00003771,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          },
          {
            symbol: 'BTCBRL',
            binanceMockClientOrderResult: {
              symbol: 'BTCBRL',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'BTCBRL',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'BTC',
                quoteAsset: 'BRL',
                filterLotSize: { stepSize: '0.00000100', minQty: '0.00000100' },
                filterPrice: { tickSize: '1.00000000' },
                filterMinNotional: { minNotional: '10.00000000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 10,
                    maxPurchaseAmount: 10,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 15, locked: 0 },
              buy: {
                currentPrice: 268748,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 271704,
              quantity: 0.000037,
              side: 'buy',
              stopPrice: 271435,
              symbol: 'BTCBRL',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'BTCBRL',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [
              {
                asset: 'BRL',
                free: 4.946952000000001,
                locked: 10.053047999999999
              }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 268748,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          },
          {
            symbol: 'BNBUSDT',
            binanceMockClientOrderResult: {
              symbol: 'BNBUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'BNBUSDT',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'BNB',
                quoteAsset: 'USDT',
                filterLotSize: { stepSize: '0.00010000', minQty: '0.00010000' },
                filterPrice: { tickSize: '0.01000000' },
                filterMinNotional: { minNotional: '10.00000000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 1,
                  currentGridTrade: {
                    triggerPercentage: 0.9,
                    stopPercentage: 1.025,
                    limitPercentage: 1.026,
                    minPurchaseAmount: 10,
                    maxPurchaseAmount: 10,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 100, locked: 10 },
              buy: {
                currentPrice: 289.48,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 297,
              quantity: 0.0338,
              side: 'buy',
              stopPrice: 296.71,
              symbol: 'BNBUSDT',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'BNBUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 1
            },
            expectedBalances: [
              { asset: 'USDT', free: 89.9614, locked: 20.0386 }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 289.48,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #2.',
                updatedAt: expect.any(Object)
              }
            }
          }
        ].forEach(t => {
          describe(`${t.symbol}`, () => {
            beforeEach(async () => {
              binanceMock.client.order = jest
                .fn()
                .mockResolvedValue(t.binanceMockClientOrderResult);

              jest.mock('../../../trailingTradeHelper/common', () => ({
                isExceedAPILimit: mockIsExceedAPILimit,
                getAPILimit: mockGetAPILimit,
                saveOrderStats: mockSaveOrderStats,
                saveOverrideAction: mockSaveOverrideAction,
                refreshOpenOrdersAndAccountInfo:
                  mockRefreshOpenOrdersAndAccountInfo
              }));

              const step = require('../place-buy-order');

              rawData = _.cloneDeep(t.rawData);

              result = await step.execute(loggerMock, rawData);
            });

            it('triggers binance.client.order', () => {
              expect(binanceMock.client.order).toHaveBeenCalledWith(
                t.binanceMockClientOrderCalledWith
              );
            });

            it('triggers saveGridTradeOrder for grid trade last buy order', () => {
              expect(mockSaveGridTradeOrder).toHaveBeenCalledWith(
                loggerMock,
                `${t.symbol}-grid-trade-last-buy-order`,
                t.mockSaveGridTradeOrderCalledWith
              );
            });

            it('triggers refreshOpenOrdersAndAccountInfo', () => {
              expect(mockRefreshOpenOrdersAndAccountInfo).toHaveBeenCalledWith(
                loggerMock,
                t.symbol
              );
            });

            it('triggers saveOrderStats', () => {
              expect(mockSaveOrderStats).toHaveBeenCalledWith(
                loggerMock,
                t.rawData.symbolConfiguration.symbols
              );
            });

            it('retruns expected value', () => {
              expect(result).toMatchObject(t.expected);
            });
          });
        });
      });

      describe('when max purchase amount is not same as minimum notional value', () => {
        [
          {
            symbol: 'BTCUPUSDT',
            binanceMockClientOrderResult: {
              symbol: 'BTCUPUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'BTCUPUSDT',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'BTCUP',
                quoteAsset: 'USDT',
                filterLotSize: { stepSize: '0.01000000', minQty: '0.01000000' },
                filterPrice: { tickSize: '0.00100000' },
                filterMinNotional: { minNotional: '10.00000000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 10,
                    maxPurchaseAmount: 50,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 101, locked: 0 },
              buy: {
                currentPrice: 200,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 202.2,
              quantity: 0.24,
              side: 'buy',
              stopPrice: 202,
              symbol: 'BTCUPUSDT',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'BTCUPUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [
              {
                asset: 'USDT',
                free: 52.472,
                locked: 48.528
              }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 200,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          },
          {
            symbol: 'ETHBTC',
            binanceMockClientOrderResult: {
              symbol: 'ETHBTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'ETHBTC',
              featureToggle: {
                notifyDebug: true
              },
              symbolInfo: {
                baseAsset: 'ETH',
                quoteAsset: 'BTC',
                filterLotSize: { stepSize: '0.00100000', minQty: '0.00100000' },
                filterPrice: { tickSize: '0.00000100' },
                filterMinNotional: { minNotional: '0.00010000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 0.0001,
                    maxPurchaseAmount: 0.001,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 0.002, locked: 0 },
              buy: {
                currentPrice: 0.044866,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 0.045359,
              quantity: 0.022,
              side: 'buy',
              stopPrice: 0.045314,
              symbol: 'ETHBTC',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'ETHBTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [
              {
                asset: 'BTC',
                free: 0.0010021020000000002,
                locked: 0.0009978979999999999
              }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 0.044866,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          },
          {
            symbol: 'ALPHABTC',
            binanceMockClientOrderResult: {
              symbol: 'ALPHABTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'ALPHABTC',
              featureToggle: {
                notifyDebug: false
              },
              symbolInfo: {
                baseAsset: 'ALPHA',
                quoteAsset: 'BTC',
                filterLotSize: { stepSize: '1.00000000', minQty: '1.00000000' },
                filterPrice: { tickSize: '0.00000001' },
                filterMinNotional: { minNotional: '0.00010000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 0.0001,
                    maxPurchaseAmount: 0.001,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 0.002, locked: 0 },
              buy: {
                currentPrice: 0.00003771,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 0.00003812,
              quantity: 26,
              side: 'buy',
              stopPrice: 0.00003808,
              symbol: 'ALPHABTC',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'ALPHABTC',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [
              {
                asset: 'BTC',
                free: 0.00100888,
                locked: 0.00099112
              }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 0.00003771,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          },
          {
            symbol: 'BTCBRL',
            openOrders: [
              {
                orderId: 456,
                price: 271704,
                quantity: 0.00004,
                side: 'buy',
                stopPrice: 271435,
                symbol: 'BTCBRL',
                timeInForce: 'GTC',
                type: 'STOP_LOSS_LIMIT'
              }
            ],
            binanceMockClientOrderResult: {
              symbol: 'BTCBRL',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520
            },
            rawData: {
              symbol: 'BTCBRL',
              featureToggle: {
                notifyDebug: false
              },
              symbolInfo: {
                baseAsset: 'BTC',
                quoteAsset: 'BRL',
                filterLotSize: { stepSize: '0.00000100', minQty: '0.00000100' },
                filterPrice: { tickSize: '1.00000000' },
                filterMinNotional: { minNotional: '10.00000000' }
              },
              symbolConfiguration: {
                symbols: [
                  'BTCUPUSDT',
                  'ETHBTC',
                  'ALPHABTC',
                  'BTCBRL',
                  'BNBUSDT'
                ],
                buy: {
                  enabled: true,
                  currentGridTradeIndex: 0,
                  currentGridTrade: {
                    triggerPercentage: 1,
                    minPurchaseAmount: 10,
                    maxPurchaseAmount: 100,
                    stopPercentage: 1.01,
                    limitPercentage: 1.011,
                    executed: false,
                    executedOrder: null
                  }
                },
                botOptions: {
                  tradingViews: [
                    {
                      interval: '5m',
                      buy: {
                        whenStrongBuy: false,
                        whenBuy: false
                      }
                    }
                  ],
                  tradingViewOptions: {
                    useOnlyWithin: 5,
                    ifExpires: 'ignore'
                  }
                },
                system: {
                  checkOrderExecutePeriod: 10
                }
              },
              action: 'buy',
              quoteAssetBalance: { free: 11, locked: 0 },
              buy: {
                currentPrice: 268748,
                openOrders: []
              },
              tradingViews: [
                {
                  request: {
                    interval: '5m'
                  },
                  result: {
                    summary: { RECOMMENDATION: 'BUY' },
                    time: tradingViewValidTime
                  }
                }
              ]
            },
            binanceMockClientOrderCalledWith: {
              price: 271704,
              quantity: 0.00004,
              side: 'buy',
              stopPrice: 271435,
              symbol: 'BTCBRL',
              timeInForce: 'GTC',
              type: 'STOP_LOSS_LIMIT'
            },
            mockSaveGridTradeOrderCalledWith: {
              symbol: 'BTCBRL',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            },
            expectedBalances: [
              {
                asset: 'BRL',
                free: 0.13183999999999862,
                locked: 10.868160000000001
              }
            ],
            expected: {
              openOrders: [{ openOrders: 'retrieved' }],
              buy: {
                currentPrice: 268748,
                openOrders: [{ buyOpenOrders: 'retrived' }],
                processMessage:
                  'Placed new stop loss limit order for buying of grid trade #1.',
                updatedAt: expect.any(Object)
              }
            }
          }
        ].forEach(t => {
          describe(`${t.symbol}`, () => {
            beforeEach(async () => {
              binanceMock.client.order = jest
                .fn()
                .mockResolvedValue(t.binanceMockClientOrderResult);

              jest.mock('../../../trailingTradeHelper/common', () => ({
                isExceedAPILimit: mockIsExceedAPILimit,
                getAPILimit: mockGetAPILimit,
                saveOrderStats: mockSaveOrderStats,
                saveOverrideAction: mockSaveOverrideAction,
                refreshOpenOrdersAndAccountInfo:
                  mockRefreshOpenOrdersAndAccountInfo
              }));

              const step = require('../place-buy-order');

              rawData = _.cloneDeep(t.rawData);

              result = await step.execute(loggerMock, rawData);
            });

            it('triggers binance.client.order', () => {
              expect(binanceMock.client.order).toHaveBeenCalledWith(
                t.binanceMockClientOrderCalledWith
              );
            });

            it('triggers saveGridTradeOrder for grid trade last buy order', () => {
              expect(mockSaveGridTradeOrder).toHaveBeenCalledWith(
                loggerMock,
                `${t.symbol}-grid-trade-last-buy-order`,
                t.mockSaveGridTradeOrderCalledWith
              );
            });

            it('triggers refreshOpenOrdersAndAccountInfo', () => {
              expect(mockRefreshOpenOrdersAndAccountInfo).toHaveBeenCalledWith(
                loggerMock,
                t.symbol
              );
            });

            it('triggers saveOrderStats', () => {
              expect(mockSaveOrderStats).toHaveBeenCalledWith(
                loggerMock,
                t.rawData.symbolConfiguration.symbols
              );
            });

            it('returns the expected value', () => {
              expect(result).toMatchObject(t.expected);
            });
          });
        });
      });

      describe('when order is placed, but cache is not returning open orders due to a cache error', () => {
        beforeEach(async () => {
          binanceMock.client.order = jest.fn().mockResolvedValue({
            symbol: 'BTCUPUSDT',
            orderId: 2701762317,
            orderListId: -1,
            clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
            transactTime: 1626946722520
          });

          jest.mock('../../../trailingTradeHelper/common', () => ({
            isExceedAPILimit: mockIsExceedAPILimit,
            getAPILimit: mockGetAPILimit,
            saveOrderStats: mockSaveOrderStats,
            saveOverrideAction: mockSaveOverrideAction,
            refreshOpenOrdersAndAccountInfo: mockRefreshOpenOrdersAndAccountInfo
          }));

          const step = require('../place-buy-order');

          rawData = _.cloneDeep({
            symbol: 'BTCUPUSDT',
            featureToggle: {
              notifyDebug: true,
              notifyOrderConfirm: false
            },
            symbolInfo: {
              baseAsset: 'BTCUP',
              quoteAsset: 'USDT',
              filterLotSize: { stepSize: '0.01000000', minQty: '0.01000000' },
              filterPrice: { tickSize: '0.00100000' },
              filterMinNotional: { minNotional: '10.00000000' }
            },
            symbolConfiguration: {
              symbols: ['BTCUPUSDT', 'ETHBTC', 'ALPHABTC', 'BTCBRL', 'BNBUSDT'],
              buy: {
                enabled: true,
                currentGridTradeIndex: 0,
                currentGridTrade: {
                  triggerPercentage: 1,
                  minPurchaseAmount: 10,
                  maxPurchaseAmount: 50,
                  stopPercentage: 1.01,
                  limitPercentage: 1.011,
                  executed: false,
                  executedOrder: null
                }
              },
              botOptions: {
                tradingViews: [
                  {
                    interval: '5m',
                    buy: {
                      whenStrongBuy: false,
                      whenBuy: false
                    }
                  }
                ],
                tradingViewOptions: {
                  useOnlyWithin: 5,
                  ifExpires: 'ignore'
                }
              },
              system: {
                checkOrderExecutePeriod: 10
              }
            },
            action: 'buy',
            quoteAssetBalance: { free: 101, locked: 0 },
            buy: {
              currentPrice: 200,
              openOrders: []
            },
            tradingViews: [
              {
                request: {
                  interval: '5m'
                },
                result: {
                  summary: { RECOMMENDATION: 'BUY' },
                  time: tradingViewValidTime
                }
              }
            ]
          });

          result = await step.execute(loggerMock, rawData);
        });

        it('triggers binance.client.order', () => {
          expect(binanceMock.client.order).toHaveBeenCalledWith({
            price: 202.2,
            quantity: 0.24,
            side: 'buy',
            stopPrice: 202,
            symbol: 'BTCUPUSDT',
            timeInForce: 'GTC',
            type: 'STOP_LOSS_LIMIT'
          });
        });

        it('triggers saveGridTradeOrder for grid trade last buy order', () => {
          expect(mockSaveGridTradeOrder).toHaveBeenCalledWith(
            loggerMock,
            `BTCUPUSDT-grid-trade-last-buy-order`,
            {
              symbol: 'BTCUPUSDT',
              orderId: 2701762317,
              orderListId: -1,
              clientOrderId: '6eGYHaJbmJrIS40eoq8ziM',
              transactTime: 1626946722520,
              currentGridTradeIndex: 0
            }
          );
        });

        it('triggers refreshOpenOrdersAndAccountInfo', () => {
          expect(mockRefreshOpenOrdersAndAccountInfo).toHaveBeenCalledWith(
            loggerMock,
            'BTCUPUSDT'
          );
        });

        it('triggers saveOrderStats', () => {
          expect(mockSaveOrderStats).toHaveBeenCalledWith(loggerMock, [
            'BTCUPUSDT',
            'ETHBTC',
            'ALPHABTC',
            'BTCBRL',
            'BNBUSDT'
          ]);
        });

        it('triggers slack.sendMessage for buy action', () => {
          expect(slackMock.sendMessage.mock.calls[0][0]).toContain(
            '*BTCUPUSDT* Action - Buy Trade #1: *STOP_LOSS_LIMIT'
          );
        });

        it('triggers slack.sendMessage for buy result', () => {
          expect(slackMock.sendMessage.mock.calls[1][0]).toContain(
            '*BTCUPUSDT* Buy Action Grid Trade #1 Result: *STOP_LOSS_LIMIT*'
          );
        });

        it('retruns expected value', () => {
          expect(result).toMatchObject({
            openOrders: [{ openOrders: 'retrieved' }],
            buy: {
              currentPrice: 200,
              openOrders: [{ buyOpenOrders: 'retrived' }],
              processMessage:
                'Placed new stop loss limit order for buying of grid trade #1.',
              updatedAt: expect.any(Object)
            }
          });
        });
      });
    });
  });
});
