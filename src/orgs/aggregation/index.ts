import { PipelineStage } from 'mongoose';
import * as moment from 'moment';

export const yearlyRevenuePipeline = (): PipelineStage[] => {
  return [
    {
      $match: {
        updatedAt: {
          $gte: moment().startOf('year').subtract(9, 'years').toDate(),
        },
      },
    },
    {
      $project: {
        amount: 1,
        date: { $dateToString: { format: '%Y-01-01', date: '$updatedAt' } },
      },
    },
    {
      $group: {
        _id: '$date',
        revenue: { $sum: '$amount' },
      },
    },
    {
      $project: {
        date: '$_id',
        revenue: 1,
        _id: 0,
      },
    },
    {
      $sort: {
        date: 1,
      },
    },
  ];
};

export const quarterlyRevenuePipeline = (): PipelineStage[] => {
  return [
    {
      $match: {
        updatedAt: {
          $gte: moment().startOf('quarter').subtract(9, 'quarters').toDate(),
        },
      },
    },
    {
      $project: {
        amount: 1,
        date: { $dateToString: { format: '%Y-%m-01', date: '$updatedAt' } },
      },
    },
    {
      $group: {
        _id: '$date',
        revenue: { $sum: '$amount' },
      },
    },
    {
      $project: {
        date: '$_id',
        revenue: 1,
        _id: 0,
      },
    },
    {
      $sort: {
        date: 1,
      },
    },
  ];
};

export const monthlyRevenuePipeline = (): PipelineStage[] => {
  return [
    {
      $match: {
        updatedAt: {
          $gte: moment().startOf('month').subtract(9, 'month').toDate(),
        },
      },
    },
    {
      $project: {
        amount: 1,
        date: { $dateToString: { format: '%Y-%m-01', date: '$updatedAt' } },
      },
    },
    {
      $group: {
        _id: '$date',
        revenue: { $sum: '$amount' },
      },
    },
    {
      $project: {
        date: '$_id',
        revenue: 1,
        _id: 0,
      },
    },
    {
      $sort: {
        date: 1,
      },
    },
  ];
};

export const weeklyRevenuePipeline = (): PipelineStage[] => {
  return [
    {
      $match: {
        updatedAt: {
          $gte: moment().startOf('week').subtract(9, 'weeks').toDate(),
        },
      },
    },
    {
      $project: {
        amount: 1,
        date: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: {
              $dateFromParts: {
                year: { $year: '$updatedAt' },
                month: { $month: '$updatedAt' },
                day: {
                  $dayOfMonth: {
                    $subtract: [
                      '$updatedAt',
                      {
                        $multiply: [
                          { $subtract: [{ $dayOfWeek: '$updatedAt' }, 2] },
                          86400000,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$date',
        revenue: { $sum: '$amount' },
      },
    },
    {
      $project: {
        date: '$_id',
        revenue: 1,
        _id: 0,
      },
    },
    {
      $sort: {
        date: 1,
      },
    },
  ];
};

export const dailyRevenuePipeline = (): PipelineStage[] => {
  return [
    {
      $match: {
        updatedAt: {
          $gte: moment().startOf('day').subtract(9, 'days').toDate(),
        },
      },
    },
    {
      $project: {
        amount: 1,
        date: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
      },
    },
    {
      $group: {
        _id: {
          date: '$date',
        },
        revenue: { $sum: '$amount' },
      },
    },
    {
      $project: {
        date: '$_id.date',
        revenue: 1,
        _id: 0,
      },
    },
    {
      $sort: {
        date: 1,
      },
    },
  ];
};

export const hourlyRevenuePipeline = (): PipelineStage[] => {
  return [
    {
      $match: {
        updatedAt: {
          $gte: moment().startOf('hour').subtract(9, 'hours').toDate(),
        },
      },
    },
    {
      $project: {
        amount: 1,
        date: {
          $dateToString: { format: '%Y-%m-%d %H:00:00%z', date: '$updatedAt' },
        },
      },
    },
    {
      $group: {
        _id: '$date',
        revenue: { $sum: '$amount' },
      },
    },
    {
      $project: {
        date: '$_id',
        revenue: 1,
        _id: 0,
      },
    },
    {
      $sort: {
        date: 1,
      },
    },
  ];
};
